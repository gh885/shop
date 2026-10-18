package com.shop.platform.order.api;

import com.shop.platform.common.Validate;
import com.shop.platform.coupon.api.CouponCommand;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
import com.shop.platform.order.mapper.TradeMapper;
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
 *   <li>{@link #settleRefund}：aftersale 退款成功时把行数量/行金额、订单与主订单已退额、履约重算与
 *       「全额退款关单」一次落完（同一事务）；{@link #syncAfterSaleBadge} 在其它的退款状态变化后写回展示角标。</li>
 * </ul>
 * 退款资金方向不在此处：aftersale 经 payment :: api 提交渠道退款，订单侧只记「退了什么、退了多少」。
 */
@Component
@RequiredArgsConstructor
public class OrderCommand {

    private final OrderMapper orderMapper;

    private final OrderItemMapper orderItemMapper;

    private final TradeMapper tradeMapper;

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
     * 退款成功的账本落点（aftersale 在「渠道确认成功」的同一事务里调用）：一条命令做完五件事。
     *
     * <p>顺序是定的：先改行账本（数量 + 金额，闸门在语句里），再累加订单与主订单已退额，再写角标，
     * 再按新账本重算履约态，最后试一把「全额退款关单」。任何一步抢不到行都抛 409 让整张退款单回滚——
     * 钱已经按成功处理，账本却对不上，是比失败更糟的半成品。
     *
     * <p>履约重算放在账本之后：它读的是本事务刚写完的行（同一连接可见），读到旧值就会算出旧状态。
     */
    public void settleRefund(RefundSettlement settlement) {
        // 1. 行账本：退货退款从有效发货量扣回，仅退款只累加已退（§8）
        for (RefundSettlement.RefundItemSettlement line : settlement.items()) {
            int changed = settlement.reclaimShipped()
                    ? orderItemMapper.increaseReturnRefunded(
                            settlement.orderId(),
                            line.orderItemId(),
                            line.quantity(),
                            line.amount().amount())
                    : orderItemMapper.increaseRefundedOnly(
                            settlement.orderId(),
                            line.orderItemId(),
                            line.quantity(),
                            line.amount().amount());
            Validate.conflict(changed == 1, "退款数量或金额超过该行可退额度");
        }

        // 2. 订单 / 主订单已退额（币种从订单上取：退款金额必须与订单同币种，INV-16 / INV-21）
        var order = orderMapper.selectById(settlement.orderId());
        Validate.present(order != null, "订单不存在");
        String currency = order.getCurrency();
        Validate.conflict(
                orderMapper.addRefundTotals(
                                settlement.orderId(),
                                settlement.refundedTotal().amount(),
                                settlement.compensation().amount(),
                                currency)
                        == 1,
                "退款金额超过订单实付");
        Validate.conflict(
                tradeMapper.addRefundTotals(
                                settlement.tradeId(),
                                settlement.refundedTotal().amount(),
                                settlement.compensation().amount(),
                                currency)
                        == 1,
                "退款金额超过主订单实付");

        // 3. 展示角标（§5.4）：结果值覆盖，不做条件转移——它没有中间态
        orderMapper.syncAfterSaleBadge(settlement.orderId(), settlement.orderBadge());
        tradeMapper.syncAfterSaleBadge(settlement.tradeId(), settlement.tradeBadge());

        // 4. 履约态重算：退款改变结清量，终态护栏与「全退且从未发货」都在重算里（§8）
        fulfillmentRecalcService.recalc(settlement.orderId(), settlement.facts());

        // 5. 全额退款关单：全部子订单终态且已退 = 已付才成立，0 行不是错误（§8）
        tradeMapper.closeIfFullyRefunded(settlement.tradeId(), OffsetDateTime.now());
    }

    /**
     * 售后角标写回（aftersale 在未出钱的退款状态变化后调用：申请、同意退货、拒绝、撤销、重试等）。
     *
     * <p>两个角标一起写：订单角标供卖家列表/详情，主订单角标供买家订单卡片。写不回（单不存在）说明调用方
     * 传错了单据，400。
     */
    public void syncAfterSaleBadge(UUID orderId, UUID tradeId, AfterSaleBadge orderBadge, AfterSaleBadge tradeBadge) {
        Validate.isTrue(orderMapper.syncAfterSaleBadge(orderId, orderBadge) == 1, "订单不存在");
        Validate.isTrue(tradeMapper.syncAfterSaleBadge(tradeId, tradeBadge) == 1, "主订单不存在");
    }
}
