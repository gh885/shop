package com.shop.platform.payment.service;

import com.shop.platform.common.Validate;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderPaymentView;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.mapper.PaymentMapper;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 支付业务：发起（PENDING）→ 确认（SUCCESS/FAILED）两段式状态机。
 *
 * <p>设计意图：支付不再是「发起即成功」的同步假象，而是模拟真实网关的异步两段式——
 * <b>发起</b>建 PENDING 流水（只占位、不动订单状态），<b>确认</b>（内部 mock 确认端点，模拟网关回调）
 * 才验签推进订单状态机、置 SUCCESS。验证通过后这段 mock 确认替换成真实网关回调即可，状态机逻辑不变。
 *
 * <p>幂等：一单至多一条成功流水（uk_payments_order_success 部分唯一索引）；串行重复发起复用既有
 * PENDING/SUCCESS，不堆积。确认用条件转移 PENDING→SUCCESS 防重复确认。
 *
 * <p>事务：发起只落流水；确认时同事务调用 OrderCommand.markPaid（同步推进订单、扣实冻结库存），
 * 订单已被取消/超时则 markPaid 抛 409 → 本事务整体回滚，流水留在 PENDING（绝不出现「单没了却显示支付成功」）。
 * 留 PENDING 而非置 FAILED 是刻意的：同一事务里改不成 FAILED（会被一起回滚），要落 FAILED 得靠真实网关
 * 回调带来的失败通知，届时在 confirm 的兄弟方法里走 {@code transition(id, FAILED)}。
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
     * 结果的推进交给回调（对应本类的 confirm）。
     */
    @Transactional
    public Payment pay(UUID userId, UUID orderId) {
        // 1. 只读点查订单（order :: api）：存在、属于本人、待付款才可支付；金额以订单投影为准，不信前端
        OrderPaymentView order = Validate.present(orderReadQuery.paymentViewById(orderId), "订单不存在");
        Validate.isTrue(order.userId().equals(userId), "订单不存在");

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
        Validate.isTrue(order.pendingPayment(), 409, "订单不是待付款状态");

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
                .amount(order.payAmount())
                .currency(order.currency())
                .channel(Payment.CHANNEL_MOCK)
                .status(Payment.STATUS_PENDING)
                .build();
        paymentMapper.insert(payment);
        log.info("[PAYMENT] 发起支付, orderId={}, userId={}, paymentId={}", orderId, userId, payment.getId());
        return payment;
    }

    /**
     * 确认支付（模拟网关回调）：校验流水归属 → 条件转移 PENDING→SUCCESS → 同事务推进订单。
     *
     * <p>订单已被取消/超时关闭时 markPaid 抛 409：本事务整体回滚（SUCCESS 转移一并撤销，流水留在 PENDING），
     * 绝不出现「钱付了单没了却显示成功」。网关侧真已收款的场景由对账 + 退款语义兜底。
     */
    @Transactional
    public Payment confirm(UUID userId, UUID paymentId) {
        // 1. 校验流水存在且属于本人
        Payment payment = Validate.notNull(paymentMapper.selectById(paymentId), "支付流水不存在");
        Validate.isTrue(payment.getUserId().equals(userId), "支付流水不存在");

        // 2. 已是成功流水（重复确认）：直接返回，幂等
        if (Payment.STATUS_SUCCESS.equals(payment.getStatus())) {
            return payment;
        }

        // 3. 条件转移 PENDING→SUCCESS：抢不到说明已被确认/失败，拒绝
        int affected = paymentMapper.transition(paymentId, Payment.STATUS_SUCCESS);
        Validate.isTrue(affected == 1, 409, "支付流水状态已变更，请刷新订单");
        payment.setStatus(Payment.STATUS_SUCCESS); // 同步内存对象，返回给前端的是转移后的成功态

        // 4. 同事务推进订单状态机 + 扣实冻结库存；订单已被取消/超时则 markPaid 抛 409，
        //    本事务整体回滚（第 3 步的 SUCCESS 转移一并撤销，流水留在 PENDING，绝不出现「取消却显示支付成功」）
        orderCommand.markPaid(payment.getOrderId());

        // 5. 回填成功时刻
        payment.setPaidAt(OffsetDateTime.now());
        paymentMapper.updateById(payment);
        log.info("[PAYMENT] 支付确认成功, paymentId={}, orderId={}", paymentId, payment.getOrderId());
        return payment;
    }
}
