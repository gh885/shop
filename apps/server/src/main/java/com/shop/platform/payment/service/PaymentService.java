package com.shop.platform.payment.service;

import com.shop.platform.common.Validate;
import com.shop.platform.order.api.OrderCheckoutLine;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderPaymentView;
import com.shop.platform.order.api.OrderReadQuery;
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
 * <p><b>但「确认」现在由买家自己调，这一条不随网关平移</b>：MOCK 渠道没有渠道侧凭据，也没有可验的签名，
 * confirm 的闸门只是「调用人是这笔流水的买家」（不存在与不归你同为 404），「钱已付」仍是调用方声明的。
 * 真实回调带不上买家 JWT，届时的入口是匿名路由 + 报文验签 + 按渠道凭据定位流水，买家自助确认的端点必须
 * 下线（形状与白名单口径见 {@code PaymentController} 类注释）。这里能平移的是状态机与事务口径，
 * 验签形状与渠道交易号列都不预留（无调用者，见 {@code PaymentGateway} 头注释）。
 *
 * <p>幂等：一单至多一条成功流水（uk_payments_order_success 部分唯一索引）；串行重复发起复用既有
 * PENDING/SUCCESS，不堆积。确认用条件转移 PENDING→SUCCESS 防重复确认。
 *
 * <p>事务：发起只落流水；确认时同事务调用 OrderCommand.markPaid（同步推进订单、扣实冻结库存），
 * 订单已被取消/超时则 markPaid 抛 409 → 本事务整体回滚，流水留在 PENDING（绝不出现「单没了却显示支付成功」）。
 * 留 PENDING 而非置 FAILED 是刻意的：同一事务里改不成 FAILED（会被一起回滚），要落 FAILED 得靠真实网关
 * 回调带来的失败通知，届时再补一个 PENDING→FAILED 的条件转移（闸门形状同 {@code confirmSuccess}，只是不回填成功时刻）。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentMapper paymentMapper;

    private final OrderReadQuery orderReadQuery;

    private final OrderCommand orderCommand;

    /**
     * 发起支付：校验订单可付 → 建 PENDING 流水（不动订单状态）。串行重复发起幂等返回既有流水。
     *
     * <p>接真实网关时：此处改为创建 PENDING 流水 + 返回收银台跳转参数，本方法只负责「下支付单」，
     * 结果的推进移到网关的验签回调——与本类 confirm 同一状态机口径、不同入口身份（回调没有买家 JWT）。
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
            return pending;
        }

        // 3. 未付过才要求待付款态；非待付款（如已取消）拒绝发起
        Validate.conflict(order.pendingPayment(), "订单不是待付款状态");

        // 4. 写 PENDING 流水（渠道 MOCK，paidAt 留空待确认时回填）
        //    这里不设 try/catch：uk_payments_order_success 是 WHERE status = 'SUCCESS' 的部分唯一索引，
        //    PENDING 行插不出唯一冲突。并发发起会各插一条 PENDING（第 2 步的短路只挡得住串行重试），
        //    但重复扣款不由此拦——两条都去 confirm 时只有第一条能让 markPaid 的条件转移过闸，
        //    第二条拿到 409 连带整个事务回滚。多出来的 PENDING 行是账面噪音，不是资金风险。
        //    （真要一单一 PENDING，得加 WHERE status = 'PENDING' 的部分唯一索引 + ON CONFLICT DO NOTHING，
        //     不能靠 catch DuplicateKeyException 回读：PG 撞唯一索引即中止整个事务，catch 后发不出任何语句。）
        Payment payment = Payment.builder()
                .orderId(orderId)
                .orderNo(order.orderNo())
                .userId(userId)
                .amount(order.payAmount().amount())
                .currency(order.payAmount().currency())
                .channel(Payment.CHANNEL_MOCK)
                .status(PaymentStatus.PENDING)
                .build();
        paymentMapper.insert(payment);
        log.info("[PAYMENT] 发起支付, orderId={}, userId={}, paymentId={}", orderId, userId, payment.getId());
        return payment;
    }

    /**
     * 合并支付发起（一次结算的 N 张单一起占位）：逐单复用/补建 PENDING 流水，不动订单状态。
     *
     * <p>幂等仍按单成立——每张单命中自己既有的成功/待确认流水就复用，不会为同一张单补第二条；
     * 整批重复发起返回同一组流水。批次归属由 {@code (user_id, checkout_key)} 圈定，查无此批与不存在同一句话（404）。
     */
    @Transactional
    public List<Payment> payBatch(UUID userId, UUID checkoutKey) {
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
     * 确认支付（MOCK 渠道，由买家自己调）：校验流水归属 → 条件转移 PENDING→SUCCESS → 同事务推进订单。
     *
     * <p>归属那道门只说得出「这是不是你的流水」，说不出「钱到过渠道」——本次判定没有任何渠道凭据参与。
     * 网关化后推进改由验签回调触发，这个入口随之关闭（不做成两个入口并存：留下它就是买家自助改资金状态）。
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

        // 3. 条件转移 PENDING→SUCCESS 并回填成功时刻：抢不到说明已被确认/失败，拒绝
        OffsetDateTime paidAt = OffsetDateTime.now();
        Validate.conflict(paymentMapper.confirmSuccess(paymentId, paidAt) == 1, "支付流水状态已变更，请刷新订单");

        // 4. 同事务推进订单状态机 + 扣实冻结库存；订单已被取消/超时则 markPaid 抛 409，
        //    本事务整体回滚（第 3 步的 SUCCESS 转移与成功时刻一并撤销，流水留在 PENDING，绝不出现「取消却显示支付成功」）
        orderCommand.markPaid(payment.getOrderId());

        // 5. 内存对象置成成功态，供返回给前端的响应投影
        payment.setStatus(PaymentStatus.SUCCESS);
        payment.setPaidAt(paidAt);
        log.info("[PAYMENT] 支付确认成功, paymentId={}, orderId={}", paymentId, payment.getOrderId());
        return payment;
    }

    /**
     * 合并支付确认（MOCK 渠道，整批一次）：批次下每条 PENDING 转移 SUCCESS 并同事务逐单推进订单。
     *
     * <p>原子性即资金口径：任一单已被取消/超时使 {@code markPaid} 抛 409，整事务回滚，全批流水留在 PENDING——
     * 绝不出现「部分单付成、部分单没了」。重复确认幂等：已 SUCCESS 的单跳过，不再转移、不再 markPaid。
     * 归属由 {@code (user_id, checkout_key)} 在回读侧圈定，查无此批 = 不存在（404）。
     */
    @Transactional
    public List<Payment> confirmBatch(UUID userId, UUID checkoutKey) {
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
            Validate.conflict(paymentMapper.confirmSuccess(payment.getId(), paidAt) == 1, "支付流水状态已变更，请刷新订单");

            // 4. 同事务推进订单状态机 + 扣实冻结库存；订单已取消则 markPaid 抛 409 → 整事务回滚
            orderCommand.markPaid(payment.getOrderId());

            // 5. 内存对象置成成功态，供返回给前端的响应投影
            payment.setStatus(PaymentStatus.SUCCESS);
            payment.setPaidAt(paidAt);
        }
        log.info("[PAYMENT] 合并支付确认成功, checkoutKey={}, 单数={}", checkoutKey, rows.size());
        return rows;
    }
}
