package com.shop.platform.order.service;

import static com.shop.platform.order.model.OrderStatus.CANCELLED;
import static com.shop.platform.order.model.OrderStatus.COMPLETED;
import static com.shop.platform.order.model.OrderStatus.PAID;
import static com.shop.platform.order.model.OrderStatus.PENDING_PAYMENT;
import static com.shop.platform.order.model.OrderStatus.SHIPPED;

import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.api.CouponCommand;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.order.events.OrderCancelledEvent;
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
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 订单状态变更的唯一去处 —— 买家、卖家、系统三类发起方的单笔事务落点。查询与下单在 {@link OrderService}。
 *
 * <p>转移合法性（状态集与转移表）定义在 {@code order.model} 的 {@link OrderStatus}（履约主线）；
 * 售后线已独立为 aftersale 模块（AfterSaleService），不在本类。本类只负责驱动：归属校验 → 条件更新（WHERE 源态 IN
 * sourcesOf(目标态)，影响行数即并发闸门）→ 库存/退款协同 → 审计流水。
 *
 * <p>同一目标态的多个入口共用一个私有落点，行为差异只在参数上：取消收在 {@link #cancelFrom}
 * （买家取消 / 待付款超时关单，各给不同的合法源态集与审计动作；已付款单没有系统取消那一条，见 ORD-60），
 * 完成收在 {@link #complete}
 * （买家确认收货 / 超时自动收货）。
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

    /** 商品销量投影命令：完成时把行项成交量累加进 product（product::api，同事务） */
    private final ProductCommand productCommand;

    /** 券命令（coupon :: api）：取消时释放占用的券（未付款）或补发新券（已付款），同事务 */
    private final CouponCommand couponCommand;

    private final OrderStatusLogWriter statusLogWriter;

    private final ApplicationEventPublisher events;

    // 履约主状态机：买家
    /** 买家取消：仅待付款/待发货可取消（源态由状态机反推），库存与退款按真实前态分流 */
    @Transactional
    public void cancel(UUID userId, UUID orderId, String reason) {
        Order order = orderMapper.requireOwned(userId, orderId);
        boolean cancelled =
                cancelFrom(order, OrderStatus.sourcesOf(CANCELLED), reason, OrderAction.CANCEL, OrderActor.BUYER);
        Validate.conflict(cancelled, "订单状态已变更，当前不可取消");
    }

    /** 确认收货：已发货 → 已完成，同时开通售后申请窗口 */
    @Transactional
    public void receive(UUID userId, UUID orderId) {
        orderMapper.requireOwned(userId, orderId);
        boolean completed = complete(orderId, OrderAction.RECEIVE, OrderActor.BUYER, false);
        Validate.conflict(completed, "订单状态已变更，当前不可确认收货");
    }

    /**
     * 买家延长确认收货窗口（ORD-63）：一次 +7 天，额度 1 次。
     *
     * <p>不是状态转移，所以不记 {@code order_status_log}（那条流水记的是「状态变了」，
     * 而这里状态没变、变的是一条截止时刻）。审计轨迹由事件与日志承担。
     *
     * <p>为什么从**当前截止列**往后加而不是从点击时刻加：截止可能已经过去一部分（买家看到「还剩 2 天」），
     * 从点击起算等于把已经过去的 2 天吞掉，那不是「延长」而是「重新设窗口」。
     */
    @Transactional
    public void extendReceive(UUID userId, UUID orderId) {
        // 1. 归属：不是本人的单同样 404（与其它买家动作同一道门，不泄露单是否存在）
        Order order = orderMapper.requireOwned(userId, orderId);

        // 2. 前置自检只为把 409 说得具体；真正的闸门在 mapper 的 WHERE（并发/已签收/额度/已过截止都在那里）
        Validate.conflict(order.getStatus() == SHIPPED, "当前订单状态不可延长收货");
        Validate.conflict(order.getDeliveredAt() == null, "订单已签收，不可延长收货");
        Validate.conflict(
                (order.getReceiveExtendedCount() == null ? 0 : order.getReceiveExtendedCount())
                        < OrderTimeouts.MAX_RECEIVE_EXTENSIONS,
                "延长收货机会已用过");
        // 时钟只取一次：自检与 mapper 的「截止未过期」比较用同一刻，免得两条各读一次表给出互相矛盾的答复
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime deadline = order.getReceiveExpireAt();
        Validate.conflict(deadline != null && deadline.isAfter(now), "收货窗口已结束，无可延长的截止时刻");

        // 3. 条件更新：0 行 = 抢不到（已被自动确认 / 已签收 / 额度被并发用掉 / 截止已过）
        boolean extended = orderMapper.extendReceiveWindow(
                        orderId,
                        deadline.plus(OrderTimeouts.RECEIVE_EXTENSION),
                        now,
                        OrderTimeouts.MAX_RECEIVE_EXTENSIONS)
                == 1;
        Validate.conflict(extended, "订单状态已变更，当前不可延长收货");
    }

    // 履约主状态机：系统超时（单笔事务落点）
    /** 待付款超时关单：只认 PENDING_PAYMENT，释放冻结库存（前态必未付款，故不发退款事件） */
    @Transactional
    public boolean closeUnpaid(Order order) {
        return cancelFrom(order, Set.of(PENDING_PAYMENT), "超时未支付，自动关闭", OrderAction.AUTO_CANCEL, OrderActor.SYSTEM);
    }

    /** 已发货超时未确认：自动确认收货（无库存/退款动作）；争议未决时让位给售后线 */
    @Transactional
    public boolean completeUnreceived(Order order) {
        // 陈旧读只用来省掉一次注定抢不到的 UPDATE，裁决本身在 markCompletedUnlessDisputed 的 WHERE 里
        if (order.getAfterSaleStatus().unresolved()) {
            return false;
        }
        return complete(order.getId(), OrderAction.AUTO_RECEIVE, OrderActor.SYSTEM, true);
    }

    // 私有：两个共用落点
    /**
     * 取消的唯一落点（买家取消 / 待付款超时共用）。
     *
     * @param sources 各入口刻意不同的合法前态集：买家两态皆可取消，系统各只认自己那一态
     * @return 是否真的改到了行；抢不到（已支付/已发货/已关闭）由调用方决定报 409 还是让位
     */
    private boolean cancelFrom(
            Order order, Set<OrderStatus> sources, String reason, OrderAction action, OrderActor actor) {
        // 1. 行项目先取：转移不改行项，先取免二次判断
        List<OrderItem> items = orderItemMapper.selectByOrderId(order.getId());

        // 2. 条件转移并取回前态（RETURNING OLD）：库存回退方向取决于真实前态，不能靠 CAS 前的陈旧读
        String trimmed = Text.trimToNull(reason);
        OrderStatus previous =
                orderMapper.cancelReturningPrevious(order.getId(), sources, OffsetDateTime.now(), trimmed);
        if (previous == null) {
            return false;
        }

        // 3. 付款后取消：库存已扣实 → 回补总库存，且必须留下退款单据（payment 同步监听，同事务 → 取消不成则退款不落）；
        //    券此时已核销（USED），走退券补偿（另发新券），不把它改回可用
        if (previous == PAID) {
            stockCommand.restock(order.getId(), toStockLines(items));
            couponCommand.returnOnRefund(order.getId());
            events.publishEvent(new OrderCancelledEvent(order.getId(), order.getUserId()));
        } else {
            // 付款前取消：只释放冻结（frozen → 可用）；券从「占用」回到买家手上（LOCKED → UNUSED），可再用
            stockCommand.release(order.getId(), toStockLines(items));
            couponCommand.releaseByOrder(order.getId());
        }

        statusLogWriter.record(order.getId(), previous, CANCELLED, action, actor, trimmed);
        log.info("[ORDER] 订单取消, orderId={}, 前态={}, 发起方={}", order.getId(), previous, actor);
        return true;
    }

    /**
     * 完成的唯一落点（买家确认收货 / 超时自动收货共用）：转 COMPLETED 并开通售后申请窗口。
     *
     * @param yieldToDispute 只有系统那一路让位给未决售后（WHERE 里重跑谓词，见 OrderMapper 同名语句）；
     *                       买家手点不让位——那是他自己的决定（AFS-43）
     */
    private boolean complete(UUID orderId, OrderAction action, OrderActor actor, boolean yieldToDispute) {
        OffsetDateTime now = OffsetDateTime.now();
        // 条件转移（合法起点集 + 完成时刻与售后窗口同批回填）见 OrderMapper.markCompleted*；
        // 抢不到行 = 有人先把这单推走了，让位给并发，不记流水也不加销量
        OffsetDateTime applyExpireAt = now.plus(OrderTimeouts.AFTER_SALE_APPLY);
        int updated = yieldToDispute
                ? orderMapper.markCompletedUnlessDisputed(orderId, now, applyExpireAt)
                : orderMapper.markCompleted(orderId, now, applyExpireAt);
        if (updated != 1) {
            return false;
        }
        statusLogWriter.record(orderId, SHIPPED, COMPLETED, action, actor, null);
        // 销量投影：完成即成交，同事务经 product :: api 累加（同 SPU 多 SKU 先合并）
        productCommand.addSold(orderItemMapper.selectByOrderId(orderId).stream()
                .collect(Collectors.toMap(OrderItem::getProductId, OrderItem::getQuantity, Integer::sum)));
        return true;
    }

    // 私有：行转换
    /** 订单行 → 库存结算行（回补/释放共用） */
    private static List<StockLine> toStockLines(List<OrderItem> items) {
        return items.stream()
                .map(i -> new StockLine(i.getSkuId(), i.getQuantity()))
                .toList();
    }
}
