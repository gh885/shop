package com.shop.platform.order.api;

import com.shop.platform.common.Money;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.api.CouponCommand;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderTimeouts;
import com.shop.platform.order.service.FulfillmentRecalcService;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 订单命令（跨模块消费）：
 * <ul>
 *   <li>{@link #markPaid}：payment 支付成功后在写流水的事务内同步调用。条件转移失败抛 409 连带支付流水一起回滚
 *       ——资金状态两侧原子。支付成功同时扣实冻结库存（inventory :: StockCommand.capture，同事务），冻结在下的才可支付。</li>
 *   <li>{@link #recordShipment} / {@link #applyShippedQuantity} / {@link #rollbackShippedQuantity} /
 *       {@link #recalcFulfillment}：logistics 在交寄、取消、签收的同一事务内推进子订单履约
 *       （docs/domain/order-model.md §8）。履约态不单独写入，一律由行账本与发货事实<b>重算</b>得出。</li>
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

    /** 履约态重算：发货事实 + 行账本 → 状态，唯一落点 */
    private final FulfillmentRecalcService fulfillmentRecalcService;

    /**
     * 支付事实落库：payment 确认某张子订单的流水后同步调用。子订单创建即待发货（PAID），
     * 本命令只回填 {@code paid_at} 与发货时限，不改 status——「未支付」由 {@code paid_at} 为空表达。
     * 失败（已付/已取消）抛 409 令调用方事务回滚；顺带扣实冻结库存、核销券。
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
    }

    /**
     * 交寄落库（logistics 在待发货 → 已发出的同一事务内调用）：只写物流摘要投影 + <b>首次</b>发货时刻与
     * 收货窗口（后续包裹不后推），状态由 {@link #recalcFulfillment} 按行账本重算。
     *
     * <p>0 行 = 未付款 / 已取消 / 已完成 / 非本店，抛 409 让包裹一起回滚——
     * 绝不出现「有包裹但订单已取消」。
     */
    public void recordShipment(
            UUID orderId, UUID shopId, String carrierName, String trackingNo, OffsetDateTime shippedAt) {
        int affected = orderMapper.refreshShipmentSummary(
                orderId, shopId, carrierName, trackingNo, shippedAt, shippedAt.plus(OrderTimeouts.RECEIVE));
        Validate.conflict(affected == 1, "订单状态已变更，当前不可发货");
    }

    /**
     * 发货量入账：交寄时把本次发出的件数累加进行账本。守卫写在语句里
     * （{@code settled_quantity + 本次 ≤ quantity}），0 行即超发，抛 409 让整张发货单回滚。
     */
    public void applyShippedQuantity(UUID orderId, Map<UUID, Integer> quantityByItem) {
        for (Map.Entry<UUID, Integer> entry : quantityByItem.entrySet()) {
            Validate.conflict(
                    orderItemMapper.increaseShipped(orderId, entry.getKey(), entry.getValue()) == 1,
                    "发货数量超过该行的可发量，请刷新后重试");
        }
    }

    /**
     * 发货量回退：取消已发出的包裹时把有效发货量退回来（这些货重新变成未发件）。
     * 0 行说明账本已被别的路径改过，同样抛 409——账对不上比失败更糟。
     */
    public void rollbackShippedQuantity(UUID orderId, Map<UUID, Integer> quantityByItem) {
        for (Map.Entry<UUID, Integer> entry : quantityByItem.entrySet()) {
            Validate.conflict(
                    orderItemMapper.decreaseShipped(orderId, entry.getKey(), entry.getValue()) == 1, "回退发货数量失败，请刷新后重试");
        }
    }

    /** 履约态重算：logistics 在交寄、取消、签收之后调（同一事务），状态只出这一条路 */
    public void recalcFulfillment(UUID orderId, OrderFulfillmentFacts facts) {
        fulfillmentRecalcService.recalc(orderId, facts);
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
