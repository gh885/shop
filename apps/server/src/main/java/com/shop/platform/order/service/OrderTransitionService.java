package com.shop.platform.order.service;

import static com.shop.platform.order.model.OrderStatus.CANCELLED;
import static com.shop.platform.order.model.OrderStatus.COMPLETED;
import static com.shop.platform.order.model.OrderStatus.PAID;
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
import com.shop.platform.order.mapper.Trade;
import com.shop.platform.order.mapper.TradeMapper;
import com.shop.platform.order.model.OrderAction;
import com.shop.platform.order.model.OrderActor;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.OrderTimeouts;
import com.shop.platform.order.model.TradeClosedReason;
import com.shop.platform.order.model.TradeStatus;
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
 * <p>两条轴分开驱动：子订单履约态由 {@link OrderStatus} 定义，主订单支付生死由 {@link TradeStatus} 定义。
 * 未支付取消是主订单级动作（关单 + 级联取消全部子订单，docs/domain/order-model.md §5.1 的唯一跨聚合破例）；
 * 已支付取消仍是子订单级（退款按单：发 OrderCancelledEvent，aftersale 建整单退款单）。
 *
 * <p>本类只负责驱动：归属校验 → 条件更新（WHERE 源态 IN sourcesOf(目标态)，影响行数即并发闸门）→
 * 库存/退款协同 → 审计流水。买家入口抢不到转移报 409，系统入口返回 false 让位——正确性不依赖加锁。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderTransitionService {

    private final OrderMapper orderMapper;

    private final OrderItemMapper orderItemMapper;

    private final TradeMapper tradeMapper;

    private final StockCommand stockCommand;

    /** 商品销量投影命令：完成时把行项成交量累加进 product（product::api，同事务） */
    private final ProductCommand productCommand;

    /** 券命令（coupon :: api）：取消时释放占用的券（未付款）或补发新券（已付款），同事务 */
    private final CouponCommand couponCommand;

    private final OrderStatusLogWriter statusLogWriter;

    private final ApplicationEventPublisher events;

    // 履约主状态机：买家
    /**
     * 买家取消：主订单还没付 → 关主订单并级联取消全部子订单（释放冻结库存与券）；
     * 主订单已付 → 只取消当前子订单（回补库存 + 发 OrderCancelledEvent，退款由 aftersale 建单）。
     */
    @Transactional
    public void cancel(UUID userId, UUID orderId, String reason) {
        Order order = orderMapper.requireOwned(userId, orderId);
        Trade trade = tradeMapper.selectById(order.getTradeId());
        Validate.present(trade != null, "订单不存在");

        if (trade.getStatus() == TradeStatus.PENDING_PAYMENT) {
            boolean closed = closeUnpaidTrade(trade, TradeClosedReason.BUYER_CANCELLED, reason, OrderActor.BUYER);
            Validate.conflict(closed, "订单状态已变更，当前不可取消");
            return;
        }

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
     * <p>不是状态转移，所以不记 {@code order_status_log}；审计轨迹由事件与日志承担。
     * 从**当前截止列**往后加而不是从点击时刻加：截止可能已经过去一部分，从点击起算等于吞掉已过去的天数。
     */
    @Transactional
    public void extendReceive(UUID userId, UUID orderId) {
        // 1. 归属：不是本人的单同样 404
        Order order = orderMapper.requireOwned(userId, orderId);

        // 2. 前置自检只为把 409 说得具体；真正的闸门在 mapper 的 WHERE
        Validate.conflict(order.getStatus() == SHIPPED, "当前订单状态不可延长收货");
        Validate.conflict(order.getDeliveredAt() == null, "订单已签收，不可延长收货");
        Validate.conflict(
                (order.getReceiveExtendedCount() == null ? 0 : order.getReceiveExtendedCount())
                        < OrderTimeouts.MAX_RECEIVE_EXTENSIONS,
                "延长收货机会已用过");
        // 时钟只取一次：自检与 mapper 的「截止未过期」比较用同一刻
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime deadline = order.getReceiveExpireAt();
        Validate.conflict(deadline != null && deadline.isAfter(now), "收货窗口已结束，无可延长的截止时刻");

        // 3. 条件更新：0 行 = 抢不到
        boolean extended = orderMapper.extendReceiveWindow(
                        orderId,
                        deadline.plus(OrderTimeouts.RECEIVE_EXTENSION),
                        now,
                        OrderTimeouts.MAX_RECEIVE_EXTENSIONS)
                == 1;
        Validate.conflict(extended, "订单状态已变更，当前不可延长收货");
    }

    // 履约主状态机：系统超时（单笔事务落点）
    /**
     * 待支付超时关单：关主订单并级联取消全部子订单。
     *
     * <p>主订单 PAID 之后不再有系统取消（ORD-60）：已付款单的出口是买家自己申请售后或取消。
     */
    @Transactional
    public boolean closeUnpaidTrade(Trade trade) {
        return closeUnpaidTrade(trade, TradeClosedReason.PAY_TIMEOUT, "超时未支付，自动关闭", OrderActor.SYSTEM);
    }

    /** 已发货超时未确认：自动确认收货；争议未决时让位给售后线 */
    @Transactional
    public boolean completeUnreceived(Order order) {
        // 陈旧读只用来省掉一次注定抢不到的 UPDATE，裁决本身在 markCompletedUnlessDisputed 的 WHERE 里
        if (order.getAfterSaleBadge().refunding()) {
            return false;
        }
        return complete(order.getId(), OrderAction.AUTO_RECEIVE, OrderActor.SYSTEM, true);
    }

    // 私有：关主订单 + 级联
    /**
     * 关主订单的唯一落点：条件转移成功才级联取消子订单。
     *
     * <p>§5.1 的跨聚合同事务破例只服务于「聚合生命周期耦合」：主订单关了，其下非终态子订单必须一起关。
     * 子订单的库存释放/券释放仍走各自的 {@link #cancelFrom}，不直接写对方的行。
     */
    private boolean closeUnpaidTrade(Trade trade, TradeClosedReason reason, String text, OrderActor actor) {
        OffsetDateTime now = OffsetDateTime.now();
        int closed =
                tradeMapper.close(trade.getId(), reason, now, List.copyOf(TradeStatus.sourcesOf(TradeStatus.CLOSED)));
        if (closed != 1) {
            return false;
        }
        OrderAction action = actor == OrderActor.SYSTEM ? OrderAction.AUTO_CANCEL : OrderAction.CANCEL;
        for (Order order : orderMapper.selectByTradeId(trade.getId())) {
            if (order.getStatus() == OrderStatus.COMPLETED || order.getStatus() == OrderStatus.CANCELLED) {
                continue;
            }
            cancelFrom(order, Set.of(PAID), text, action, actor);
        }
        log.info("[TRADE] 主订单关闭, tradeId={}, reason={}, 发起方={}", trade.getId(), reason, actor);
        return true;
    }

    // 私有：两个共用落点
    /**
     * 取消子订单的唯一落点（买家取消 / 主订单关单级联共用）。
     *
     * <p>付款前后分流读的是 {@code paid_at}，不是状态：子订单创建即 PAID（待发货），
     * 「这个 PAID 有没有付过钱」只有 paid_at 说得清。
     *
     * @param sources 各入口刻意不同的合法前态集
     * @return 是否真的改到了行
     */
    private boolean cancelFrom(
            Order order, Set<OrderStatus> sources, String reason, OrderAction action, OrderActor actor) {
        // 1. 行项目先取：转移不改行项，先取免二次判断
        List<OrderItem> items = orderItemMapper.selectByOrderId(order.getId());

        // 2. 条件转移并取回前态（RETURNING OLD）
        String trimmed = Text.trimToNull(reason);
        OffsetDateTime now = OffsetDateTime.now();
        OrderStatus previous = orderMapper.cancelReturningPrevious(order.getId(), sources, now, trimmed);
        if (previous == null) {
            return false;
        }

        // 3. 付款后取消：库存已扣实 → 回补总库存；退款与退券交给 aftersale 的退款单（同一事务，见 OrderCancelledEvent）
        if (order.getPaidAt() != null) {
            stockCommand.restock(order.getId(), toStockLines(items));
            events.publishEvent(new OrderCancelledEvent(order.getId(), order.getUserId()));
        } else {
            // 付款前取消：只释放冻结（frozen → 可用）；券从「占用」回到买家手上（LOCKED → UNUSED）
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
     * @param yieldToDispute 只有系统那一路让位给未决售后
     */
    private boolean complete(UUID orderId, OrderAction action, OrderActor actor, boolean yieldToDispute) {
        OffsetDateTime now = OffsetDateTime.now();
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
