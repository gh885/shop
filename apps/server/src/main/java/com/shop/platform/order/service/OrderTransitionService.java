package com.shop.platform.order.service;

import static com.shop.platform.order.model.OrderStatus.CANCELLED;
import static com.shop.platform.order.model.OrderStatus.COMPLETED;
import static com.shop.platform.order.model.OrderStatus.PAID;
import static com.shop.platform.order.model.OrderStatus.PENDING_PAYMENT;
import static com.shop.platform.order.model.OrderStatus.SHIPPED;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.order.dto.ShipOrderRequest;
import com.shop.platform.order.events.OrderAfterSaleRefundedEvent;
import com.shop.platform.order.events.OrderCancelledEvent;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderItem;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
import com.shop.platform.order.model.AfterSaleAction;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.AfterSaleType;
import com.shop.platform.order.model.OrderAction;
import com.shop.platform.order.model.OrderActor;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.OrderTimeouts;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 订单状态变更的唯一去处 —— 买家、卖家、系统三类发起方的单笔事务落点。查询与下单在 {@link OrderService}。
 *
 * <p>转移合法性（状态集与转移表）定义在 {@code order.model} 的 {@link OrderStatus}（履约主线）与
 * {@link AfterSaleStatus}（售后线，与主线正交）；本类只负责驱动：归属校验 → 条件更新（WHERE 源态 IN
 * sourcesOf(目标态)，影响行数即并发闸门）→ 库存/退款协同 → 审计流水。
 *
 * <p>同一目标态的多个入口共用一个私有落点，行为差异只在参数上：取消收在 {@link #cancelFrom}
 * （买家取消 / 待付款超时 / 待发货超时，各给不同的合法源态集与审计动作），完成收在 {@link #complete}
 * （买家确认收货 / 超时自动收货），售后四动作收在 {@link #advanceAfterSale}（差异在 {@link AfterSaleAction} 一张表）。
 * 买家入口抢不到转移报 409，系统入口返回 false 让位——正确性不依赖加锁。
 *
 * <p>超时批量扫描（非事务）在 {@link OrderTimeoutService}：与本类的单笔事务方法分属两个 bean，
 * 规避 Spring 自调用导致 @Transactional 失效。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderTransitionService {

    private final OrderMapper orderMapper;

    private final OrderItemMapper orderItemMapper;

    private final StockCommand stockCommand;

    private final OrderStatusLogWriter statusLogWriter;

    private final ApplicationEventPublisher events;

    // ========== 履约主状态机：买家 ==========

    /** 买家取消：仅待付款/待发货可取消（源态由状态机反推），库存与退款按真实前态分流 */
    @Transactional
    public void cancel(UUID userId, UUID orderId, String reason) {
        Order order = requireOwned(userId, orderId);
        boolean cancelled =
                cancelFrom(order, OrderStatus.sourcesOf(CANCELLED), reason, OrderAction.CANCEL, OrderActor.BUYER);
        Validate.isTrue(cancelled, 409, "订单状态已变更，当前不可取消");
    }

    /** 确认收货：已发货 → 已完成，同时开通售后申请窗口 */
    @Transactional
    public void receive(UUID userId, UUID orderId) {
        requireOwned(userId, orderId);
        boolean completed = complete(orderId, OrderAction.RECEIVE, OrderActor.BUYER);
        Validate.isTrue(completed, 409, "订单状态已变更，当前不可确认收货");
    }

    // ========== 履约主状态机：卖家 ==========

    /** 发货：待发货 → 已发货，回填物流信息（一单一包裹）与确认收货截止 */
    @Transactional
    public void ship(UUID shopId, UUID orderId, ShipOrderRequest req) {
        // 1. 条件转移：限定本店 + 状态机反推的源状态，越店与错态都在影响行数上暴露
        OffsetDateTime now = OffsetDateTime.now();
        int affected = orderMapper.update(
                null,
                condition(orderId)
                        .eq(Order::getShopId, shopId)
                        .in(Order::getStatus, OrderStatus.sourcesOf(SHIPPED))
                        .set(Order::getStatus, SHIPPED)
                        .set(Order::getShippedAt, now)
                        .set(Order::getReceiveExpireAt, now.plus(OrderTimeouts.RECEIVE))
                        .set(Order::getLogisticsCompany, req.logisticsCompany())
                        .set(Order::getTrackingNo, req.trackingNo()));
        if (affected == 1) {
            statusLogWriter.record(orderId, PAID, SHIPPED, OrderAction.SHIP, OrderActor.SELLER, null);
            return;
        }

        // 2. 失败细分原因：不存在/非本店给 404，状态不对给 409
        Order existing = orderMapper.selectById(orderId);
        if (existing == null || !existing.getShopId().equals(shopId)) {
            throw BusinessException.notFound("订单不存在");
        }
        throw new BusinessException(409, "订单不是待发货状态");
    }

    // ========== 履约主状态机：系统超时（单笔事务落点，批量扫描见 OrderTimeoutService） ==========

    /** 待付款超时关单：只认 PENDING_PAYMENT，释放冻结库存（前态必未付款，故不发退款事件） */
    @Transactional
    public boolean closeUnpaid(Order order) {
        return cancelFrom(order, Set.of(PENDING_PAYMENT), "超时未支付，自动关闭", OrderAction.AUTO_CANCEL, OrderActor.SYSTEM);
    }

    /** 待发货超时自动取消：只认 PAID，回补总库存并落退款单据 */
    @Transactional
    public boolean cancelUnshipped(Order order) {
        return cancelFrom(order, Set.of(PAID), "超时未发货，自动取消并退款", OrderAction.AUTO_CANCEL, OrderActor.SYSTEM);
    }

    /** 已发货超时未确认：自动确认收货（无库存/退款动作） */
    @Transactional
    public boolean completeUnreceived(Order order) {
        return complete(order.getId(), OrderAction.AUTO_RECEIVE, OrderActor.SYSTEM);
    }

    // ========== 售后状态机 ==========

    /** 买家申请售后（仅退款 / 退货退款，申请时定 type）：仅「已完成 + 售后线空闲 + 申请窗口未过」可发起 */
    @Transactional
    public void applyAfterSale(UUID userId, UUID orderId, AfterSaleType type, String reason) {
        requireOwned(userId, orderId);
        advanceAfterSale(orderId, AfterSaleAction.APPLY, reason, update -> update.eq(Order::getStatus, COMPLETED)
                .gt(Order::getApplyExpireAt, OffsetDateTime.now())
                .set(Order::getAfterSaleType, type));
    }

    /**
     * 卖家同意售后，按已申请的 {@code type} 分派：
     * <ul>
     *   <li>仅退款：APPLYING → REFUNDED 一步到位（同意即退款，无「已同意待退款」悬挂态），无库存回补。</li>
     *   <li>退货退款：APPLYING → RETURNING（进入退货流程，暂不退款），等买家回寄、卖家收货后再退。</li>
     * </ul>
     * 退款由 payment 同步监听同事务落库，落不成则整单回滚、售后线停回原态 —— 不假报「已退款」。
     */
    @Transactional
    public void agreeAfterSale(UUID shopId, UUID orderId) {
        Order order = requireShopOrder(shopId, orderId);
        if (order.getAfterSaleType() == AfterSaleType.RETURN_REFUND) {
            advanceAfterSale(orderId, AfterSaleAction.AGREE_RETURN, null);
            return;
        }
        // 仅退款：转移成功后立即退款（见 advanceAfterSale 之上的 completeRefund 注释）
        advanceAfterSale(
                orderId,
                AfterSaleAction.REFUND,
                null,
                update -> update.set(Order::getRefundAmount, order.getPayAmount()));
        completeRefund(order);
    }

    /**
     * 买家回寄并填写退货物流单（仅退货退款、处于 RETURNING 的可操作）：态不变，只落物流单号并记审计。
     */
    @Transactional
    public void returnGoods(UUID userId, UUID orderId, String company, String trackingNo) {
        requireOwned(userId, orderId);
        advanceAfterSale(orderId, AfterSaleAction.RETURN_GOODS, null, update -> update.set(
                        Order::getReturnLogisticsCompany, company)
                .set(Order::getReturnTrackingNo, trackingNo));
    }

    /**
     * 卖家确认收到退货（仅退货退款、处于 RETURNING 的可操作）：RETURNING → REFUNDED，
     * 同步回补总库存（货真的回来了）并退款。仅退款路径没有本步——它同意即退，不回补库存。
     */
    @Transactional
    public void receiveReturn(UUID shopId, UUID orderId) {
        Order order = requireShopOrder(shopId, orderId);
        advanceAfterSale(
                orderId,
                AfterSaleAction.RECEIVE_RETURN,
                null,
                update -> update.set(Order::getRefundAmount, order.getPayAmount()));
        stockCommand.restock(orderId, toStockLines(orderItemMapper.selectByOrderId(orderId)));
        completeRefund(order);
    }

    /** 卖家拒绝售后：APPLYING → REJECTED（终态） */
    @Transactional
    public void rejectAfterSale(UUID shopId, UUID orderId) {
        requireShopOrder(shopId, orderId);
        advanceAfterSale(orderId, AfterSaleAction.REJECT, null);
    }

    /** 买家撤销售后申请：APPLYING → CLOSED（终态） */
    @Transactional
    public void cancelAfterSale(UUID userId, UUID orderId) {
        requireOwned(userId, orderId);
        advanceAfterSale(orderId, AfterSaleAction.CLOSE, null);
    }

    // ========== 私有：三个共用落点 ==========

    /**
     * 取消的唯一落点（买家取消 / 待付款超时 / 待发货超时共用）。
     *
     * @param sources 各入口刻意不同的合法前态集：买家两态皆可取消，系统各只认自己那一态
     * @return 是否真的改到了行；抢不到（已支付/已发货/已关闭）由调用方决定报 409 还是让位
     */
    private boolean cancelFrom(
            Order order, Set<OrderStatus> sources, String reason, OrderAction action, OrderActor actor) {
        // 1. 行项目先取：转移不改行项，先取免二次判断
        List<OrderItem> items = orderItemMapper.selectByOrderId(order.getId());

        // 2. 条件转移并取回前态（RETURNING OLD）：库存回退方向取决于真实前态，不能靠 CAS 前的陈旧读
        String trimmed = reason == null || reason.isBlank() ? null : reason.trim();
        OrderStatus previous =
                orderMapper.cancelReturningPrevious(order.getId(), sources, OffsetDateTime.now(), trimmed);
        if (previous == null) {
            return false;
        }

        // 3. 付款后取消：库存已扣实 → 回补总库存，且必须留下退款单据（payment 同步监听，同事务 → 取消不成则退款不落）
        if (previous == PAID) {
            stockCommand.restock(order.getId(), toStockLines(items));
            events.publishEvent(new OrderCancelledEvent(order.getId(), order.getUserId()));
        } else {
            // 付款前取消：只释放冻结（frozen → 可用）
            stockCommand.release(order.getId(), toStockLines(items));
        }

        statusLogWriter.record(order.getId(), previous, CANCELLED, action, actor, trimmed);
        log.info("[ORDER] 订单取消, orderId={}, 前态={}, 发起方={}", order.getId(), previous, actor);
        return true;
    }

    /** 完成的唯一落点（买家确认收货 / 超时自动收货共用）：转 COMPLETED 并开通售后申请窗口 */
    private boolean complete(UUID orderId, OrderAction action, OrderActor actor) {
        OffsetDateTime now = OffsetDateTime.now();
        int affected = orderMapper.update(
                null,
                condition(orderId)
                        .in(Order::getStatus, OrderStatus.sourcesOf(COMPLETED))
                        .set(Order::getStatus, COMPLETED)
                        .set(Order::getCompletedAt, now)
                        .set(Order::getApplyExpireAt, now.plus(OrderTimeouts.AFTER_SALE_APPLY)));
        if (affected != 1) {
            return false;
        }
        statusLogWriter.record(orderId, SHIPPED, COMPLETED, action, actor, null);
        return true;
    }

    /** 售后线转移（无附加列的动作，from == target 也适用：如 RETURN_GOODS 只填物流不改态） */
    private void advanceAfterSale(UUID orderId, AfterSaleAction action, String reason) {
        advanceAfterSale(orderId, action, reason, update -> {});
    }

    /**
     * 售后线转移的唯一落点：条件更新（WHERE after_sale_status = action.from()）→ 影响行数闸门 → 审计。
     * 每个动作的合法前态、目标态、审计动作、发起方、冲突文案全在 {@link AfterSaleAction} 一张表里，
     * extraSets 承载该动作附带的列（申请填类型、同意/收货填退款额、回寄填物流单）。
     * 副作用（退款走网关、退货回补库存、发事件）不在状态转移内，由调用方在成功后编排。
     */
    private void advanceAfterSale(
            UUID orderId, AfterSaleAction action, String reason, Consumer<LambdaUpdateWrapper<Order>> extraSets) {
        AfterSaleStatus from = action.from();
        LambdaUpdateWrapper<Order> update =
                condition(orderId).eq(Order::getAfterSaleStatus, from).set(Order::getAfterSaleStatus, action.target());
        extraSets.accept(update);
        Validate.isTrue(orderMapper.update(null, update) == 1, 409, action.conflictMessage());
        statusLogWriter.record(orderId, from, action.target(), action.auditAction(), action.actor(), reason);
    }

    /**
     * 退款收尾：通知 payment 经网关落退款单据（同步同事务，落不成整单回滚）后回填退款完成时刻。
     * 金额口径（refundAmount）已在转移时随订单快照记下，这里只补「退没退成」的时刻——
     * 事件同步返回即 payment 已把该单成功流水转 REFUNDED（或抛 409 令整体回滚），列值始终诚实。
     */
    private void completeRefund(Order order) {
        events.publishEvent(
                new OrderAfterSaleRefundedEvent(order.getId(), order.getUserId(), order.payAmountAsMoney()));
        orderMapper.update(
                null,
                new LambdaUpdateWrapper<Order>()
                        .eq(Order::getId, order.getId())
                        .set(Order::getAfterSaleRefundedAt, OffsetDateTime.now()));
    }

    // ========== 私有：动作前置校验 ==========

    /** 买家侧归属：非本人一律 404，不泄露单据存在性 */
    private Order requireOwned(UUID userId, UUID orderId) {
        Order order = Validate.notNull(orderMapper.selectById(orderId), "订单不存在");
        Validate.isTrue(order.getUserId().equals(userId), "订单不存在");
        return order;
    }

    /** 卖家侧归属：非本店一律 404 */
    private Order requireShopOrder(UUID shopId, UUID orderId) {
        Order order = Validate.notNull(orderMapper.selectById(orderId), "订单不存在");
        Validate.isTrue(order.getShopId().equals(shopId), "订单不存在");
        return order;
    }

    /** 更新起点：主键定位 + 影响行数即乐观闸门 */
    private static LambdaUpdateWrapper<Order> condition(UUID orderId) {
        return new LambdaUpdateWrapper<Order>().eq(Order::getId, orderId);
    }

    /** 订单行 → 库存结算行（回补/释放共用） */
    private static List<StockLine> toStockLines(List<OrderItem> items) {
        return items.stream()
                .map(i -> new StockLine(i.getSkuId(), i.getQuantity()))
                .toList();
    }
}
