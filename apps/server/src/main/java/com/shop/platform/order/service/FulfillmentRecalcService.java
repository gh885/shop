package com.shop.platform.order.service;

import com.shop.platform.order.api.OrderFulfillmentFacts;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderItem;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
import com.shop.platform.order.model.OrderAction;
import com.shop.platform.order.model.OrderActor;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.OrderTimeouts;
import com.shop.platform.product.api.ProductCommand;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 子订单履约态重算 —— 状态不再由「谁调了什么转移」写入，而是每发生一次发货事实（交寄 / 取消包裹 / 签收）
 * 从<b>行账本 + 发货事实</b>重新算出来（docs/domain/order-model.md §8）。
 *
 * <p>顺序是定死的，不能重排：
 * <ol>
 *   <li>终态（已完成 / 已取消）直接返回，不参与重算——终态护栏同时也写在条件更新的 WHERE 里；</li>
 *   <li>全部行结清且从未发过货 ⇒ 已取消（全额退款）。没有这条，全退的单会停在「已发货」等一批不存在的货；</li>
 *   <li>其余按 {@code settled_quantity} 映射：全结清 ⇒ 已发货、有行结清 ⇒ 部分发货、全零 ⇒ 待发货；</li>
 *   <li>全结清且全部未取消包裹已签收 ⇒ 已完成（先落到已发货，再按状态机进完成，两条条件更新各自留痕）。</li>
 * </ol>
 *
 * <p>审计动作按事实取：往前推进记 SHIP、回退记 CANCEL、完成记 AUTO_RECEIVE、全退关单记 AUTO_CANCEL。
 * 记录粒度是「状态变了什么」，不区分是哪个包裹——包裹的账在 logistics 自己的表里。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class FulfillmentRecalcService {

    private final OrderMapper orderMapper;

    private final OrderItemMapper orderItemMapper;

    private final OrderStatusLogWriter statusLogWriter;

    /** 商品销量投影命令：完成时把行项成交量累加进 product（product::api，同事务） */
    private final ProductCommand productCommand;

    /**
     * 按事实重算子订单履约态。调用方必须与「事实落库」在同一个事务里，否则读到的是旧账本。
     *
     * @param facts logistics 给出的发货结论；交寄 / 取消后 {@code allShipmentsDelivered} 可能为 false
     */
    @Transactional
    public void recalc(UUID orderId, OrderFulfillmentFacts facts) {
        // 1. 单不存在或已到终态：重算没有可改的东西（终态护栏同时写在条件更新的 WHERE 里）
        Order order = orderMapper.selectById(orderId);
        if (order == null || order.getStatus() == OrderStatus.COMPLETED || order.getStatus() == OrderStatus.CANCELLED) {
            return;
        }

        // 2. 行账本是判定输入：settled_quantity 是「发了 + 退了」的并集（§4.3 / INV-11）
        List<OrderItem> items = orderItemMapper.selectByOrderId(orderId);
        boolean allSettled = items.stream().allMatch(i -> i.getSettledQuantity() >= i.getQuantity());
        boolean noneSettled = items.stream().allMatch(i -> i.getSettledQuantity() == 0);

        // 3. 全退且从未发货：关单，优先于第 4 步的映射（§8「全退且从未发货」）
        if (allSettled && !facts.hasEverShipped()) {
            cancelAsFullyRefunded(order);
            return;
        }

        // 4. 全结清：先落到已发货，再看签收事实决定要不要收口到完成
        if (allSettled) {
            move(orderId, order.getStatus(), OrderStatus.SHIPPED);
            if (facts.allShipmentsDelivered()) {
                complete(orderId, facts.lastDeliveredAt(), items);
            }
            return;
        }

        // 5. 未全结清：按结清量映射（允许从已发货回退到部分发货 / 待发货）
        move(orderId, order.getStatus(), noneSettled ? OrderStatus.PAID : OrderStatus.PARTIALLY_SHIPPED);
    }

    /**
     * 履约态落库 + 审计：条件更新带回前态，只有真的改到行才记流水——
     * 从未生效的转移不该出现在账本里。
     */
    private void move(UUID orderId, OrderStatus current, OrderStatus target) {
        if (current == target) {
            return;
        }
        OrderStatus previous = orderMapper.moveFulfillmentReturningPrevious(orderId, target, OffsetDateTime.now());
        if (previous == null) {
            return; // 已被终态挡住，或并发方先改到同一态
        }
        OrderAction action = target == OrderStatus.PAID || target == OrderStatus.PARTIALLY_SHIPPED
                ? OrderAction.CANCEL
                : OrderAction.SHIP;
        statusLogWriter.record(orderId, previous, target, action, OrderActor.SELLER, null);
        log.info("[ORDER] 履约态重算, orderId={}, {} → {}", orderId, previous, target);
    }

    /**
     * 完成：先写「物流全部签收」的投影（收货窗口从签收起算），再走完成的条件转移。
     * 抢不到转移（并发买家已确认收货）就什么都不做——完成只该发生一次。
     */
    private void complete(UUID orderId, OffsetDateTime deliveredAt, List<OrderItem> items) {
        OffsetDateTime signedAt = deliveredAt == null ? OffsetDateTime.now() : deliveredAt;
        orderMapper.markAllDelivered(orderId, signedAt, signedAt.plus(OrderTimeouts.RECEIVE));

        OffsetDateTime completedAt = OffsetDateTime.now();
        int updated = orderMapper.markCompleted(orderId, completedAt, completedAt.plus(OrderTimeouts.AFTER_SALE_APPLY));
        if (updated != 1) {
            return;
        }
        statusLogWriter.record(
                orderId, OrderStatus.SHIPPED, OrderStatus.COMPLETED, OrderAction.AUTO_RECEIVE, OrderActor.SYSTEM, null);
        productCommand.addSold(items.stream()
                .collect(Collectors.toMap(OrderItem::getProductId, OrderItem::getQuantity, Integer::sum)));
    }

    /**
     * 全退且从未发货：子订单转已取消，原因记全额退款（INV-20）。
     *
     * <p>库存与资金的回吐不在这里——退款成功那条链路已经在同事务里做完了，本方法只翻状态，
     * 否则会退两次库存。
     */
    private void cancelAsFullyRefunded(Order order) {
        OrderStatus previous = orderMapper.cancelReturningPrevious(
                order.getId(), OrderStatus.sourcesOf(OrderStatus.CANCELLED), OffsetDateTime.now(), "全额退款，自动关闭");
        if (previous == null) {
            return;
        }
        statusLogWriter.record(
                order.getId(), previous, OrderStatus.CANCELLED, OrderAction.AUTO_CANCEL, OrderActor.SYSTEM, "全额退款");
        log.info("[ORDER] 全退且从未发货，子订单关单, orderId={}", order.getId());
    }
}
