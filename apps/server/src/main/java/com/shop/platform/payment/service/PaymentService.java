package com.shop.platform.payment.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.TradeCommand;
import com.shop.platform.order.api.TradePaymentView;
import com.shop.platform.order.api.TradeReadQuery;
import com.shop.platform.payment.gateway.PaymentGateway;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.mapper.PaymentMapper;
import com.shop.platform.payment.model.PaymentStatus;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 支付业务：发起（PENDING）→ 确认（SUCCESS/FAILED）两段式状态机，支付归属主订单。
 *
 * <p>一次结算 = 一次支付 = 一张主订单；支付覆盖多个卖家时，渠道流水仍按子订单各记一条——
 * 退款按退款单发起（行级金额，经 payment :: api），而「整笔支付」由共同的 {@code trade_id} 表达。
 *
 * <p><b>确认的闸门按渠道分两种</b>：MOCK 渠道没有渠道侧凭据，「钱已付」由调用方声明；
 * 支付宝渠道必须 {@code queryTrade} 拿到 {@code TRADE_SUCCESS} 才推进。
 *
 * <p>事务：确认时同事务逐单调用 {@link OrderCommand#markPaid}（回填 paid_at、扣实库存、核销券），
 * 最后尝试 {@link TradeCommand#markPaidIfComplete} 推进主订单——全部子订单付清才落 PAID。
 * 任一子订单已被取消/超时则 markPaid 抛 409 → 本事务整体回滚，流水留在 PENDING。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentMapper paymentMapper;

    private final TradeReadQuery tradeReadQuery;

    private final OrderCommand orderCommand;

    private final TradeCommand tradeCommand;

    private final PaymentChannels channels;

    /**
     * 发起整张主订单的支付：校验可付 → 逐子订单复用/补建 PENDING 流水（不动订单状态）→ 建渠道交易。
     */
    @Transactional
    public PaymentBatchView payTrade(UUID userId, UUID tradeId) {
        TradePaymentView trade = Validate.presentOwned(
                tradeReadQuery.paymentViewById(tradeId), TradePaymentView::userId, userId, "订单不存在");

        // 已付清：幂等返回成功流水，不再建渠道交易
        if (!trade.pendingPayment()) {
            List<Payment> rows = paymentMapper.selectByTrade(tradeId);
            if (!rows.isEmpty() && rows.stream().allMatch(p -> p.getStatus() == PaymentStatus.SUCCESS)) {
                return PaymentBatchView.from(trade, rows);
            }
            throw BusinessException.conflict("订单不是待付款状态");
        }

        List<Payment> rows = ensurePendingRows(userId, trade);
        attachPayUrls(rows);
        log.info("[PAYMENT] 发起支付, tradeId={}, userId={}, 流水数={}", tradeId, userId, rows.size());
        return PaymentBatchView.from(trade, rows);
    }

    /**
     * 合并支付发起的历史入口（按单张子订单）：内部按主订单整批补建流水，返回该子订单那条。
     * 保留它是为了让「订单列表补付单张」这条路径仍能走通；收银台统一走 {@link #payTrade}。
     */
    @Transactional
    public Payment pay(UUID userId, UUID orderId) {
        UUID tradeId = tradeReadQuery.tradeIdByOrderId(orderId).orElseThrow(() -> BusinessException.notFound("订单不存在"));
        TradePaymentView trade = Validate.presentOwned(
                tradeReadQuery.paymentViewById(tradeId), TradePaymentView::userId, userId, "订单不存在");
        List<Payment> rows =
                trade.pendingPayment() ? ensurePendingRows(userId, trade) : paymentMapper.selectByTrade(tradeId);
        attachPayUrls(rows);
        return rows.stream()
                .filter(p -> orderId.equals(p.getOrderId()))
                .findFirst()
                .orElseThrow(() -> BusinessException.conflict("订单不是待付款状态"));
    }

    /**
     * 确认整张主订单：逐条 PENDING→SUCCESS，同事务推进每张子订单；全部付清后主订单落 PAID。
     *
     * <p><b>逐条按流水自己的渠道过闸</b>（与单条确认同口径）：MOCK 由调用方声明，真实渠道必须
     * {@code queryTrade} 拿到成功态——整批确认不能成为绕过「钱到没到」的旁路。真实渠道下买家逐单付清之前
     * 这里会 409「支付未完成」，整批不推进。
     */
    @Transactional
    public PaymentBatchView confirmTrade(UUID userId, UUID tradeId) {
        TradePaymentView trade = Validate.presentOwned(
                tradeReadQuery.paymentViewById(tradeId), TradePaymentView::userId, userId, "订单不存在");
        List<Payment> rows = paymentMapper.selectByTrade(tradeId);
        Validate.present(!rows.isEmpty(), "支付流水不存在");

        for (Payment payment : rows) {
            // 1. 重复确认幂等：已成功直接跳过
            if (payment.getStatus() == PaymentStatus.SUCCESS) {
                continue;
            }
            // 2. 只从 PENDING 推进
            Validate.conflict(payment.getStatus() == PaymentStatus.PENDING, "支付流水状态已变更，请刷新订单");

            // 3. 取渠道权威结果：非 MOCK 渠道查到未支付就整批拒绝，不做「整批声明成功」
            String gatewayTradeNo = resolveGatewayTradeNo(payment);

            // 4. 条件转移 PENDING→SUCCESS
            OffsetDateTime paidAt = OffsetDateTime.now();
            Validate.conflict(
                    paymentMapper.confirmSuccess(payment.getId(), paidAt, gatewayTradeNo) == 1, "支付流水状态已变更，请刷新订单");

            // 5. 同事务推进子订单（回填 paid_at、扣实库存、核销券）
            orderCommand.markPaid(payment.getOrderId());

            payment.setStatus(PaymentStatus.SUCCESS);
            payment.setPaidAt(paidAt);
            payment.setGatewayTradeNo(gatewayTradeNo);
        }

        // 6. 全部子订单已付清才推进主订单；只付了部分就留在待支付
        tradeCommand.markPaidIfComplete(tradeId);
        log.info("[PAYMENT] 主订单确认成功, tradeId={}, 流水数={}", tradeId, rows.size());
        return PaymentBatchView.from(trade, rows);
    }

    /**
     * 单条流水确认（按支付流水）：保留给「单张子订单补付」路径。
     * 确认后同样尝试推进主订单，但只有全部子订单都付清时才会成功。
     */
    @Transactional
    public Payment confirm(UUID userId, UUID paymentId) {
        // 1. 校验流水存在且属于本人
        Payment payment =
                Validate.requireOwned(paymentMapper.selectById(paymentId), Payment::getUserId, userId, "支付流水不存在");

        // 2. 已是成功流水（重复确认）：直接返回，幂等
        if (payment.getStatus() != null && payment.getStatus().isSuccess()) {
            return payment;
        }

        // 3. 取渠道权威结果：非 MOCK 渠道必须查到已支付，否则拒绝推进
        String gatewayTradeNo = resolveGatewayTradeNo(payment);

        // 4. 条件转移 PENDING→SUCCESS 并回填成功时刻与渠道交易号
        OffsetDateTime paidAt = OffsetDateTime.now();
        Validate.conflict(paymentMapper.confirmSuccess(paymentId, paidAt, gatewayTradeNo) == 1, "支付流水状态已变更，请刷新订单");

        // 5. 同事务推进子订单；失败则整体回滚（流水留在 PENDING）
        orderCommand.markPaid(payment.getOrderId());
        tradeCommand.markPaidIfComplete(payment.getTradeId());

        payment.setStatus(PaymentStatus.SUCCESS);
        payment.setPaidAt(paidAt);
        payment.setGatewayTradeNo(gatewayTradeNo);
        log.info("[PAYMENT] 支付确认成功, paymentId={}, tradeId={}", paymentId, payment.getTradeId());
        return payment;
    }

    /** 逐子订单复用/补建 PENDING：一单一成功流水、一单至多一条待确认流水 */
    private List<Payment> ensurePendingRows(UUID userId, TradePaymentView trade) {
        List<Payment> rows = new ArrayList<>(trade.orders().size());
        PaymentGateway gateway = channels.defaultGateway();
        for (TradePaymentView.TradePaymentLine line : trade.orders()) {
            Payment success = paymentMapper.selectSuccessByOrder(line.orderId());
            if (success != null) {
                rows.add(success);
                continue;
            }
            Payment pending = paymentMapper.selectPendingByOrder(line.orderId());
            if (pending != null) {
                rows.add(pending);
                continue;
            }
            Payment payment = Payment.builder()
                    .tradeId(trade.tradeId())
                    .orderId(line.orderId())
                    .orderNo(line.orderNo())
                    .userId(userId)
                    .amount(line.payAmount().amount())
                    .currency(line.payAmount().currency())
                    .channel(gateway.channel())
                    .status(PaymentStatus.PENDING)
                    .build();
            paymentMapper.insert(payment);
            rows.add(payment);
        }
        return rows;
    }

    /**
     * 渠道侧交易号：MOCK 无渠道凭据返回 null；真实渠道查询后未支付直接 409。
     *
     * <p>按<b>流水自己的 channel</b> 找网关，不看当前默认配置：默认渠道日后改成别的，
     * 历史流水依然要按它当初走的渠道去查。
     */
    private String resolveGatewayTradeNo(Payment payment) {
        if (PaymentChannels.declarative(payment.getChannel())) {
            return null;
        }
        PaymentGateway gateway = channels.of(payment.getChannel());
        PaymentGateway.TradeQueryResult result =
                gateway.queryTrade(payment.getId().toString());
        Validate.conflict(result.paid(), "支付未完成，请先完成付款");
        return result.gatewayTradeNo();
    }

    /** 真实渠道的收银台跳转地址随响应一次性下发；MOCK 渠道为 null。 */
    private void attachPayUrls(List<Payment> rows) {
        for (Payment payment : rows) {
            if (PaymentChannels.declarative(payment.getChannel())) {
                continue;
            }
            PaymentGateway gateway = channels.of(payment.getChannel());
            payment.setPayUrl(gateway.createTrade(new PaymentGateway.TradeParams(
                    payment.getId().toString(), payment.amountAsMoney(), "订单 " + payment.getOrderNo())));
        }
    }
}
