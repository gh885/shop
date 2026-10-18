package com.shop.platform.aftersale.service;

import com.shop.platform.aftersale.mapper.Refund;
import com.shop.platform.aftersale.mapper.RefundExecution;
import com.shop.platform.aftersale.mapper.RefundExecutionMapper;
import com.shop.platform.aftersale.mapper.RefundLine;
import com.shop.platform.aftersale.mapper.RefundLineMapper;
import com.shop.platform.aftersale.mapper.RefundMapper;
import com.shop.platform.aftersale.model.RefundLineType;
import com.shop.platform.aftersale.model.RefundStatus;
import com.shop.platform.aftersale.model.RefundType;
import com.shop.platform.common.Money;
import com.shop.platform.common.Validate;
import com.shop.platform.coupon.api.CouponCommand;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.logistics.api.ShipmentFactsQuery;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderFulfillmentFacts;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.order.api.OrderRefundLineView;
import com.shop.platform.order.api.RefundSettlement;
import com.shop.platform.payment.api.PaymentRefund;
import com.shop.platform.payment.api.PaymentRefundAttempt;
import com.shop.platform.payment.api.PaymentRefundCommand;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 一次退款的执行落点：提交渠道 → 落执行记录 → 成功则推进状态并结算账本；失败则按重试线取舍。
 *
 * <p>为什么单独一个 bean：定时重试要以「一笔退款一个事务」跑（{@code Sweep.each} 隔离失败），
 * 调用方若是同一个 bean 的自调用，{@code @Transactional} 不生效。卖家同意与超时自动退款都经这里，
 * 不存在第二套退款逻辑。
 *
 * <p><b>行锁先于渠道调用</b>：两路人马（卖家点了同意、重试任务恰好也来）会同时看到「退款中」，
 * 各自调一次渠道、各自累加一次已退额。渠道侧靠退款单号幂等不会真退两次，但本地账本会记两笔；
 * {@code SELECT … FOR UPDATE} 把执行串行化，后到者醒来时状态已经不是退款中。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class RefundExecutionService {

    /** 自动重试上限：失败三次转人工。次数即执行记录数，不另存计数列 */
    public static final int MAX_ATTEMPTS = 3;

    private final RefundMapper refundMapper;

    private final RefundLineMapper refundLineMapper;

    private final RefundExecutionMapper refundExecutionMapper;

    private final PaymentRefundCommand paymentRefundCommand;

    private final OrderReadQuery orderReadQuery;

    private final OrderCommand orderCommand;

    private final ShipmentFactsQuery shipmentFactsQuery;

    private final StockCommand stockCommand;

    private final CouponCommand couponCommand;

    private final RefundBadges refundBadges;

    /**
     * 执行一笔「退款中」的单：成功即出钱并结账，失败只追加记录、按次数决定是否转失败。
     *
     * <p>先锁行再调渠道：抢不到锁的执行者醒来会看到状态已变（已退款/已失败/已撤销）直接返回，
     * 不会再退一次。
     */
    @Transactional
    public void execute(UUID refundId) {
        // 1. 行锁读单：状态不是「退款中」就没有可执行的（已成功、已转人工、已撤销）
        Refund refund = refundMapper.selectByIdForUpdate(refundId);
        if (refund == null || refund.getStatus() != RefundStatus.REFUNDING) {
            return;
        }

        // 2. 提交渠道：失败不抛异常，退款单号是渠道幂等键（重试不会退第二次）
        PaymentRefundAttempt attempt = paymentRefundCommand.refund(new PaymentRefund(
                refund.getOrderId(), refund.getRefundNo(), refund.amountAsMoney(), "退款单 " + refund.getRefundNo()));

        // 3. 每一次调用都落一条执行记录——重试不改状态，只追加记录（§4.5）
        refundExecutionMapper.insert(RefundExecution.builder()
                .refundId(refundId)
                .amount(refund.getAmount())
                .currency(refund.getCurrency())
                .success(attempt.success())
                .gatewayRefundNo(attempt.gatewayRefundNo())
                .errorMessage(attempt.errorMessage())
                .build());

        // 4. 失败：重试未耗尽就停在退款中（下一轮重试再来）；耗尽转失败，等人工处置
        if (!attempt.success()) {
            long attempts = refundExecutionMapper.countByRefundId(refundId);
            if (attempts >= MAX_ATTEMPTS) {
                Validate.conflict(refundMapper.markFailed(refundId) == 1, "退款单状态已变更，转人工失败");
                refundBadges.refresh(refund.getOrderId(), refund.getTradeId());
                log.warn("[REFUND] 自动重试耗尽转失败, refundId={}, attempts={}", refundId, attempts);
            } else {
                // 仍停在退款中：角标要立刻显示「退款中」（申请时的角标可能还是上一笔的结论）
                refundBadges.refresh(refund.getOrderId(), refund.getTradeId());
                log.warn(
                        "[REFUND] 渠道退款失败, refundId={}, attempts={}, error={}",
                        refundId,
                        attempts,
                        attempt.errorMessage());
            }
            return;
        }

        // 5. 成功：条件转移退款中 → 已退款。抢不到行说明并发方已处理（行锁下不会发生），整笔回滚
        OffsetDateTime now = OffsetDateTime.now();
        Validate.conflict(refundMapper.markRefunded(refundId, now) == 1, "退款单状态已变更，本次退款未结案");

        // 6. 结算账本：行数量/金额、订单与主订单已退额、角标、履约重算、全额退款关单，一条命令落完
        List<RefundLine> lines = refundLineMapper.selectByRefundId(refundId);
        Money refundedTotal = sum(refund.getCurrency(), lines, RefundLineType.ITEM, RefundLineType.SHIPPING);
        Money compensation = sum(refund.getCurrency(), lines, RefundLineType.COMPENSATION);
        OrderFulfillmentFacts facts = shipmentFactsQuery.forwardFacts(refund.getOrderId());
        orderCommand.settleRefund(new RefundSettlement(
                refund.getOrderId(),
                refund.getTradeId(),
                lines.stream()
                        .filter(l -> l.getLineType() == RefundLineType.ITEM)
                        .map(l -> new RefundSettlement.RefundItemSettlement(
                                l.getOrderItemId(), l.getQuantity(), l.amountAsMoney()))
                        .toList(),
                refundedTotal,
                compensation,
                refund.getType() == RefundType.RETURN_REFUND,
                refundBadges.ofOrder(refund.getOrderId()),
                refundBadges.ofTrade(refund.getTradeId()),
                facts));

        // 7. 退货退款：货真的回来了才回补库存（仅退款不回补，§8 / AFS-38）
        if (refund.getType() == RefundType.RETURN_REFUND) {
            restockReturned(refund, lines);
        }

        // 8. 整单退满才退券：部分退款不动券（coupon.md §7）
        if (isFullyRefunded(refund.getOrderId())) {
            couponCommand.returnOnRefund(refund.getOrderId());
        }

        // 9. 终态放闸：让出「同一订单行一张未完结退款单」的名额
        refundLineMapper.deactivateByRefundId(refundId);

        log.info(
                "[REFUND] 退款成功, refundId={}, orderId={}, type={}, amount={}",
                refundId,
                refund.getOrderId(),
                refund.getType(),
                refund.getAmount());
    }

    /** 该订单是否已退满（订单侧累计列的口径，与 INV-18 同一个数） */
    public boolean isFullyRefunded(UUID orderId) {
        return orderReadQuery
                .refundViewById(orderId)
                .map(o -> o.refundedAmount().amount() >= o.payAmount().amount())
                .orElse(false);
    }

    /** 按退款单的 item 行回补库存：只补真的寄回来的那几件，不是整单购买量 */
    private void restockReturned(Refund refund, List<RefundLine> lines) {
        Map<UUID, UUID> skuByItem = orderReadQuery.refundLinesById(refund.getOrderId()).stream()
                .collect(Collectors.toMap(OrderRefundLineView::orderItemId, OrderRefundLineView::skuId));
        List<StockLine> stockLines = lines.stream()
                .filter(l -> l.getLineType() == RefundLineType.ITEM)
                .map(l -> {
                    UUID skuId = skuByItem.get(l.getOrderItemId());
                    Validate.present(skuId != null, "退款行对应的订单行不存在");
                    return new StockLine(skuId, l.getQuantity());
                })
                .toList();
        if (!stockLines.isEmpty()) {
            stockCommand.restock(refund.getOrderId(), stockLines);
        }
    }

    /** 金额按行类型汇总：逐行取实体的 amountAsMoney 相加，换算口径只住在实体里 */
    private static Money sum(String currency, List<RefundLine> lines, RefundLineType... types) {
        List<RefundLineType> wanted = List.of(types);
        Money total = Money.zero(currency);
        for (RefundLine line : lines) {
            if (wanted.contains(line.getLineType())) {
                total = total.plus(line.amountAsMoney());
            }
        }
        return total;
    }
}
