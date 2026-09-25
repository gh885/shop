package com.shop.platform.order.api;

import com.shop.platform.common.Money;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.api.CouponCommand;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderAction;
import com.shop.platform.order.model.OrderActor;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.OrderTimeouts;
import com.shop.platform.order.service.OrderStatusLogWriter;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 订单命令（跨模块消费）：
 * <ul>
 *   <li>{@link #markPaid}：payment 支付成功后在写流水的事务内同步调用。条件转移失败抛 409 连带支付流水一起回滚
 *       ——资金状态两侧原子。支付成功同时扣实冻结库存（inventory :: StockCommand.capture，同事务），冻结在下的才可支付。</li>
 *   <li>{@link #syncAfterSale}：aftersale 每次售后转移后写回订单投影列（最近一张单的状态、退款口径），
 *       供订单列表/详情展示；单据真相在 aftersale.tickets，order 不反向读它。</li>
 * </ul>
 * 退款方向不在此处：由 order / aftersale 的 events 驱动 payment 落单据。
 */
@Component
@RequiredArgsConstructor
public class OrderCommand {

    private final OrderMapper orderMapper;

    private final OrderItemMapper orderItemMapper;

    private final StockCommand stockCommand;

    /** 券命令（coupon :: api）：支付核销在同事务内完成 */
    private final CouponCommand couponCommand;

    private final OrderStatusLogWriter statusLogWriter;

    /**
     * 支付成功的落点：条件转移 PENDING_PAYMENT → PAID，回填发货截止；失败抛 409 令调用方事务回滚。
     * 闸门语句（合法起点集 + 两个时刻的推导）见 {@code OrderMapper.markPaid}，409 的裁决留在这里。
     *
     * <p>顺带把本单占用的券核销掉（LOCKED → USED，coupon :: api，同事务）：券的占用与资金到账必须一起成立。
     * 本单没用券时该调用无副作用。
     */
    public void markPaid(UUID orderId) {
        OffsetDateTime now = OffsetDateTime.now();
        int affected = orderMapper.markPaid(orderId, now, now.plus(OrderTimeouts.SHIP));
        Validate.conflict(affected == 1, "订单已取消或已支付，本次支付未生效");

        // 支付成功即扣实冻结库存（同事务）：货真的没了，冻结量归还
        List<StockLine> lines = orderItemMapper.selectByOrderId(orderId).stream()
                .map(i -> new StockLine(i.getSkuId(), i.getQuantity()))
                .toList();
        stockCommand.capture(orderId, lines);

        // 支付成功即核销券：自此不可逆，退款走补发新券而不是把这张改回可用
        couponCommand.useByOrder(orderId);

        statusLogWriter.record(
                orderId, OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderAction.PAY, OrderActor.BUYER, null);
    }

    /**
     * 发货推进（logistics 在落完包裹后同步调用，同事务）：
     * <ul>
     *   <li>首次发货（PAID → SHIPPED）：回填发货时刻与收货窗口，落一行审计流水，并发抢不到招 409
     *       —— 包裹已在本事务内落下，订单推不进去就整体回滚，不会出现「有包裹但订单还是待发货」。</li>
     *   <li>追加包裹（SHIPPED → SHIPPED）：订单上没有状态转移，只刷新物流摘要投影（最新包裹口径），不落审计流水。</li>
     * </ul>
     * 返回是否首次发货（调用方只用于日志）。
     */
    public boolean markShipped(
            UUID orderId, UUID shopId, String carrierName, String trackingNo, OffsetDateTime shippedAt) {
        OrderStatus previous = orderMapper.markShippedReturningPrevious(
                orderId, shopId, carrierName, trackingNo, shippedAt, shippedAt.plus(OrderTimeouts.RECEIVE));
        Validate.conflict(previous != null, "订单状态已变更，当前不可发货");
        boolean firstShipment = previous == OrderStatus.PAID;
        if (firstShipment) {
            statusLogWriter.record(orderId, previous, OrderStatus.SHIPPED, OrderAction.SHIP, OrderActor.SELLER, null);
        }
        return firstShipment;
    }

    /**
     * 签收落库（logistics 在轨迹推进到已签收后同步调用，同事务）：写 delivered_at 投影，
     * 并把「确认收货」窗口从签收起重算（未签收的单仍按发货兜底，见 {@link OrderTimeouts#RECEIVE}）。
     * 只认 SHIPPED + 未签收，重复签收与已完成/已取消的单都是无副作用的幂等返回。
     */
    public void markDelivered(UUID orderId, OffsetDateTime deliveredAt) {
        orderMapper.markDelivered(orderId, deliveredAt, deliveredAt.plus(OrderTimeouts.RECEIVE));
    }

    /**
     * 包裹退回落库（logistics 在轨迹推进到退回后同步调用，同事务）：货没到买家手上，收货窗口从退回时刻重算，
     * 不让「发货起 7 天」在包裹已退回时把单转完成（LOG-17）。只认 SHIPPED + 未签收，已签收/已完成的单不动。
     */
    public void markReturned(UUID orderId, OffsetDateTime returnedAt) {
        orderMapper.markReturned(orderId, returnedAt.plus(OrderTimeouts.RECEIVE));
    }

    /**
     * 售后投影写回：afterSaleStatus 取 aftersale 售后单状态的 name()（与 {@link AfterSaleStatus} 同词表，NONE 除外），
     * refundAmount 仅在退款完成时传入，其余传 null 不动。
     *
     * <p>语句形状与「换币种连 WHERE 一起挡掉」的理由在 {@code OrderMapper.syncAfterSale}；这里只留 0 行的说法——
     * 投影写不回（单不存在）就是调用方传错了单据，400。
     */
    public void syncAfterSale(UUID orderId, String afterSaleStatus, Money refundAmount) {
        Validate.isTrue(
                orderMapper.syncAfterSale(orderId, AfterSaleStatus.valueOf(afterSaleStatus), refundAmount) == 1,
                "订单不存在");
    }
}
