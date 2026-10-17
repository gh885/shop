package com.shop.platform.payment.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import com.shop.platform.order.api.OrderCheckoutLine;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderPaymentView;
import com.shop.platform.order.api.OrderReadQuery;
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
 * 支付业务：发起（PENDING）→ 确认（SUCCESS/FAILED）两段式状态机。
 *
 * <p>设计意图：支付不再是「发起即成功」的同步假象，而是先把真实网关的两段式形状跑起来——
 * <b>发起</b>建 PENDING 流水（只占位、不动订单状态），<b>确认</b>才条件转移置 SUCCESS 并推进订单状态机。
 *
 * <p><b>确认的闸门按渠道分两种</b>：MOCK 渠道没有渠道侧凭据，「钱已付」由调用方声明（V1 的已知边界）；
 * 支付宝渠道必须 {@code queryTrade} 拿到 {@code TRADE_SUCCESS} 才推进——支付结果的权威来源是渠道，
 * 不是请求方。两条分支共用一个条件转移与同一个 {@code markPaid}，所以资金不变式只有一份。
 *
 * <p>幂等：一单至多一条成功流水（uk_payments_order_success 部分唯一索引）；串行重复发起复用既有
 * PENDING/SUCCESS，不堆积。确认用条件转移 PENDING→SUCCESS 防重复确认。
 *
 * <p>事务：发起只落流水；确认时同事务调用 OrderCommand.markPaid（同步推进订单、扣实冻结库存），
 * 订单已被取消/超时则 markPaid 抛 409 → 本事务整体回滚，流水留在 PENDING（绝不出现「单没了却显示支付成功」）。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentMapper paymentMapper;

    private final OrderReadQuery orderReadQuery;

    private final OrderCommand orderCommand;

    private final PaymentChannels channels;

    /**
     * 发起支付：校验订单可付 → 建 PENDING 流水（不动订单状态）→ 建渠道交易，跳转地址挂在返回的流水上。
     */
    @Transactional
    public Payment pay(UUID userId, UUID orderId) {
        // 1. 只读点查订单（order :: api）：存在、属于本人、待付款才可支付；金额以订单投影为准，不信前端
        OrderPaymentView order = Validate.presentOwned(
                orderReadQuery.paymentViewById(orderId), OrderPaymentView::userId, userId, "订单不存在");

        // 2. 幂等短路：已有成功流水直接返回；已有待确认流水复用（不堆积多条 PENDING）
        Payment success = paymentMapper.selectSuccessByOrder(orderId);
        if (success != null) {
            return success;
        }
        Payment pending = paymentMapper.selectPendingByOrder(orderId);
        if (pending != null) {
            pending.setPayUrl(payUrlOf(pending, order));
            return pending;
        }

        // 3. 未付过才要求待付款态；非待付款（如已取消）拒绝发起
        Validate.conflict(order.pendingPayment(), "订单不是待付款状态");

        // 4. 写 PENDING 流水。这里不设 try/catch：uk_payments_order_success 是 WHERE status = 'SUCCESS'
        //    的部分唯一索引，PENDING 行插不出唯一冲突。并发发起会各插一条 PENDING（第 2 步的短路只挡得住串行重试），
        //    但重复扣款不由此拦——两条都去 confirm 时只有第一条能让 markPaid 的条件转移过闸，
        //    第二条拿到 409 连带整个事务回滚。多出来的 PENDING 行是账面噪音，不是资金风险。
        PaymentGateway gateway = channels.defaultGateway();
        Payment payment = Payment.builder()
                .orderId(orderId)
                .orderNo(order.orderNo())
                .userId(userId)
                .amount(order.payAmount().amount())
                .currency(order.payAmount().currency())
                .channel(gateway.channel())
                .status(PaymentStatus.PENDING)
                .build();
        paymentMapper.insert(payment);

        // 5. 建渠道交易：失败则整个事务回滚（不留下一条买家永远付不了的 PENDING 流水）
        payment.setPayUrl(payUrlOf(payment, order));
        log.info(
                "[PAYMENT] 发起支付, orderId={}, userId={}, paymentId={}, channel={}",
                orderId,
                userId,
                payment.getId(),
                payment.getChannel());
        return payment;
    }

    /** 合并支付发起（MOCK 渠道）：逐单复用/补建 PENDING 流水，不动订单状态。 */
    @Transactional
    public List<Payment> payBatch(UUID userId, UUID checkoutKey) {
        requireMergeSupported();

        // 1. 整批订单：归属由 user_id + checkout_key 在查询侧圈定，查无此批 = 不存在
        List<OrderCheckoutLine> lines = orderReadQuery.checkoutLines(userId, checkoutKey);
        Validate.present(!lines.isEmpty(), "订单不存在");

        // 2. 逐单复用/补建 PENDING：未付过才要求待付款态，任一单非待付款且无既有流水 → 409
        List<Payment> rows = new ArrayList<>(lines.size());
        for (OrderCheckoutLine line : lines) {
            rows.add(reuseOrInsertPending(userId, checkoutKey, line));
        }
        log.info("[PAYMENT] 合并发起支付, checkoutKey={}, userId={}, 单数={}", checkoutKey, userId, rows.size());
        return rows;
    }

    /** 单笔在该批次下的复用/补建：与 {@link #pay} 同一幂等口径，只是流水额外盖上 checkout_key */
    private Payment reuseOrInsertPending(UUID userId, UUID checkoutKey, OrderCheckoutLine line) {
        Payment success = paymentMapper.selectSuccessByOrder(line.orderId());
        if (success != null) {
            return success;
        }
        Payment pending = paymentMapper.selectPendingByOrder(line.orderId());
        if (pending != null) {
            return pending;
        }
        Validate.conflict(line.pendingPayment(), "订单不是待付款状态");
        Payment payment = Payment.builder()
                .orderId(line.orderId())
                .checkoutKey(checkoutKey)
                .orderNo(line.orderNo())
                .userId(userId)
                .amount(line.payAmount().amount())
                .currency(line.payAmount().currency())
                .channel(Payment.CHANNEL_MOCK)
                .status(PaymentStatus.PENDING)
                .build();
        paymentMapper.insert(payment);
        return payment;
    }

    /**
     * 确认支付：校验流水归属 → 按流水渠道取权威结果 → 条件转移 PENDING→SUCCESS → 同事务推进订单。
     *
     * <p>MOCK 渠道的闸门只说得出「这是不是你的流水」，说不出「钱到过渠道」；
     * 支付宝渠道改成向渠道查询，{@code TRADE_SUCCESS} 才放行。
     *
     * <p>订单已被取消/超时关闭时 markPaid 抛 409：本事务整体回滚（SUCCESS 转移一并撤销，流水留在 PENDING），
     * 绝不出现「钱付了单没了却显示成功」。网关侧真已收款的场景由对账 + 退款语义兜底。
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

        // 4. 条件转移 PENDING→SUCCESS 并回填成功时刻与渠道交易号：抢不到说明已被确认/失败，拒绝
        OffsetDateTime paidAt = OffsetDateTime.now();
        Validate.conflict(paymentMapper.confirmSuccess(paymentId, paidAt, gatewayTradeNo) == 1, "支付流水状态已变更，请刷新订单");

        // 5. 同事务推进订单状态机 + 扣实冻结库存；订单已被取消/超时则 markPaid 抛 409，
        //    本事务整体回滚（第 4 步的 SUCCESS 转移与成功时刻一并撤销，流水留在 PENDING）
        orderCommand.markPaid(payment.getOrderId());

        // 6. 内存对象置成成功态，供返回给前端的响应投影
        payment.setStatus(PaymentStatus.SUCCESS);
        payment.setPaidAt(paidAt);
        payment.setGatewayTradeNo(gatewayTradeNo);
        log.info("[PAYMENT] 支付确认成功, paymentId={}, orderId={}", paymentId, payment.getOrderId());
        return payment;
    }

    /** 合并支付确认（MOCK 渠道，整批一次）：批次下每条 PENDING 转移 SUCCESS 并同事务逐单推进订单。 */
    @Transactional
    public List<Payment> confirmBatch(UUID userId, UUID checkoutKey) {
        requireMergeSupported();

        List<Payment> rows = paymentMapper.selectByCheckoutKey(userId, checkoutKey);
        Validate.present(!rows.isEmpty(), "支付流水不存在");

        for (Payment payment : rows) {
            // 1. 重复确认幂等：已成功直接跳过
            if (payment.getStatus() == PaymentStatus.SUCCESS) {
                continue;
            }
            // 2. 只从 PENDING 推进；REFUNDED/FAILED 等来态说明批次状态已变，拒绝
            Validate.conflict(payment.getStatus() == PaymentStatus.PENDING, "支付流水状态已变更，请刷新订单");

            // 3. 条件转移 PENDING→SUCCESS 并回填成功时刻：抢不到说明被并发确认，409 连带整批回滚
            OffsetDateTime paidAt = OffsetDateTime.now();
            Validate.conflict(paymentMapper.confirmSuccess(payment.getId(), paidAt, null) == 1, "支付流水状态已变更，请刷新订单");

            // 4. 同事务推进订单状态机 + 扣实冻结库存；订单已取消则 markPaid 抛 409 → 整事务回滚
            orderCommand.markPaid(payment.getOrderId());

            // 5. 内存对象置成成功态，供返回给前端的响应投影
            payment.setStatus(PaymentStatus.SUCCESS);
            payment.setPaidAt(paidAt);
        }
        log.info("[PAYMENT] 合并支付确认成功, checkoutKey={}, 单数={}", checkoutKey, rows.size());
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

    /** 建渠道交易拿收银台地址；MOCK 渠道返回 null */
    private String payUrlOf(Payment payment, OrderPaymentView order) {
        if (PaymentChannels.declarative(payment.getChannel())) {
            return null;
        }
        PaymentGateway gateway = channels.of(payment.getChannel());
        return gateway.createTrade(
                new PaymentGateway.TradeParams(payment.getId().toString(), order.payAmount(), "订单 " + order.orderNo()));
    }

    /**
     * 合并支付只支持 MOCK 渠道：支付宝一笔交易对应一个 out_trade_no，而合并批次是 N 条独立流水。
     * 真实渠道下先逐单支付，合并支付单模型是后续独立任务。
     */
    private void requireMergeSupported() {
        if (!PaymentChannels.declarative(channels.defaultGateway().channel())) {
            throw BusinessException.badRequest("当前支付渠道不支持合并支付，请逐单支付");
        }
    }
}
