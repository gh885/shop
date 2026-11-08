package com.shop.platform.payment.service;

import com.shop.platform.common.id.BizNo;
import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import com.shop.platform.payment.api.PaymentCommand;
import com.shop.platform.payment.events.RefundSucceeded;
import com.shop.platform.payment.internal.PaymentChannel;
import com.shop.platform.payment.mapper.PaymentOrderMapper;
import com.shop.platform.payment.mapper.RefundOrderMapper;
import com.shop.platform.payment.model.PaymentStatus;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 原路退款。
 *
 * <p><b>为什么是同步命令，不是消费售后的事件：</b> 如果 payment 订阅 {@code returns} 的事件，
 * 依赖就变成 {@code payment → returns → trade → payment}，一个真环。走命令，方向是
 * {@code returns → payment}，和 {@code trade → payment} 同向，不成环。
 *
 * <p>两道幂等，缺一不可：
 *
 * <ul>
 *   <li>调用方重试 → {@code refund_order} 的 {@code (payment_id, seller_order_id, reason)} 唯一索引挡住
 *   <li>同一笔已成功再调 → 读出来直接返回成功，不重复打渠道
 * </ul>
 *
 * <p><b>渠道不受理就返回失败，不假装成功。</b> 假装成功会让售后单走到"已完成"，而钱根本没出去。
 * 失败的退款单留在 {@code pending}，{@link RefundRetryJob} 会定时再试——那才是退款最终不会
 * 卡死的保证，这里的返回值只告诉调用方"这一次"成没成。
 */
@Component
public class RefundService {

    private static final Logger log = LoggerFactory.getLogger(RefundService.class);

    private final PaymentOrderMapper payments;
    private final RefundOrderMapper refunds;
    private final PaymentChannel channel;
    private final ApplicationEventPublisher publisher;
    private final TransactionTemplate transactionTemplate;

    public RefundService(
            PaymentOrderMapper payments,
            RefundOrderMapper refunds,
            PaymentChannel channel,
            ApplicationEventPublisher publisher,
            TransactionTemplate transactionTemplate) {
        this.payments = Objects.requireNonNull(payments, "payments");
        this.refunds = Objects.requireNonNull(refunds, "refunds");
        this.channel = Objects.requireNonNull(channel, "channel");
        this.publisher = Objects.requireNonNull(publisher, "publisher");
        this.transactionTemplate = Objects.requireNonNull(transactionTemplate, "transactionTemplate");
    }

    public PaymentCommand.Refund refund(
            UUID orderGroupId, UUID sellerOrderId, long amount, String currency, String reason) {
        PaymentOrderMapper.PaymentRow payment = payments.findByGroup(orderGroupId).stream()
                .filter(row -> row.status() == PaymentStatus.SUCCESS || row.status() == PaymentStatus.REFUNDED)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("订单没有成功的支付单: " + orderGroupId));

        return refundOf(payment, sellerOrderId, amount, currency, reason);
    }

    /**
     * 挂账退款：按支付单直接退，不要求支付单是 success——挂账行本身就是"钱到了"的证据，
     * 迟到回调的钱挂在一张 closed 的支付单上，但它确实在渠道手里。
     *
     * <p>不带子单（{@code sellerOrderId = null}）。去重由 {@code uq_refund_suspense_biz}
     * 表达式唯一索引兜——COALESCE 把 NULL 折成零 uuid，挂账退款和普通退款吃同一把键；
     * 这里先查后插是为了把已成功的那笔原样返回、不打第二遍渠道，reason 里带挂账行 id。
     */
    public PaymentCommand.Refund refundSuspense(UUID paymentId, long amount, String currency, String reason) {
        PaymentOrderMapper.PaymentRow payment =
                payments.find(paymentId).orElseThrow(() -> new IllegalStateException("支付单不存在: " + paymentId));

        return refundOf(payment, null, amount, currency, reason);
    }

    private PaymentCommand.Refund refundOf(
            PaymentOrderMapper.PaymentRow payment, UUID sellerOrderId, long amount, String currency, String reason) {
        java.util.Optional<RefundOrderMapper.RefundRow> existing = sellerOrderId == null
                ? refunds.findBySuspenseReason(payment.id(), reason)
                : refunds.findByBiz(payment.id(), sellerOrderId, reason);
        if (existing.isPresent() && "success".equals(existing.get().status())) {
            // 同一笔已退成功：直接返回，不重复打渠道
            return new PaymentCommand.Refund(existing.get().id(), true);
        }

        refunds.insert(
                Ids.newId(),
                BizNo.of("RF", LocalDate.now()),
                payment.id(),
                payment.orderGroupId(),
                sellerOrderId,
                amount,
                currency,
                reason);

        RefundOrderMapper.RefundRow refund = (sellerOrderId == null
                        ? refunds.findBySuspenseReason(payment.id(), reason)
                        : refunds.findByBiz(payment.id(), sellerOrderId, reason))
                .orElseThrow(() -> new IllegalStateException("退款单插入后读不到: " + reason));
        if ("success".equals(refund.status())) {
            return new PaymentCommand.Refund(refund.id(), true);
        }

        return new PaymentCommand.Refund(refund.id(), attemptChannel(refund));
    }

    /**
     * 重试一条停在 {@code pending} 的退款单，只给 {@link RefundRetryJob} 调。
     *
     * <p>成功路径和首试完全同一条（渠道 → CAS 置 success → 发 {@code RefundSucceeded}），
     * 售后单的完成由下游事件驱动，不在这里关心。失败计一次 attempts，超上限由 job 看着办。
     *
     * @return 这一次是否退款成功
     */
    public boolean retryPending(RefundOrderMapper.RefundRow refund) {
        if (!"pending".equals(refund.status())) {
            // 扫描到落库之间被别的路径推进了；该发的事件那次已经发过
            return false;
        }
        boolean success = attemptChannel(refund);
        if (!success) {
            int attempts = refunds.incrementAttempts(refund.id());
            log.info("退款重试失败：refund={} attempts={}", refund.id(), attempts);
        }
        return success;
    }

    /** 渠道调用 + CAS 置成功 + 发事件。返回 false = 渠道异常或未受理，单子留在 pending。 */
    private boolean attemptChannel(RefundOrderMapper.RefundRow refund) {
        PaymentOrderMapper.PaymentRow payment = payments.find(refund.paymentId())
                .orElseThrow(() -> new IllegalStateException("支付单不存在: " + refund.paymentId()));

        PaymentChannel.RefundResult result;
        try {
            result =
                    channel.refund(new PaymentChannel.Refund(refund.refundNo(), payment.outTradeNo(), refund.amount()));
        } catch (RuntimeException e) {
            log.warn("渠道退款异常，留在 pending：refund={} reason={}", refund.id(), refund.reason(), e);
            return false;
        }
        if (!result.success()) {
            log.warn("渠道未受理退款：refund={} reason={}", refund.id(), refund.reason());
            return false;
        }
        // markSuccess 与事件登记必须同事务提交（outbox 语义）。以前这里没有事务：
        // AFTER_COMMIT 的监听器在没有事务时直接不投递——RefundRetryJob 路径退成功了
        // 钱却永远不触发 RefundSucceeded，售后单卡死在 refunding 还没人知道
        return Boolean.TRUE.equals(transactionTemplate.execute(status -> {
            if (!refunds.markSuccess(refund.id(), result.channelRefundId())) {
                // 并发下另一个请求先退了：它已经发过事件，这里不能再发
                return true;
            }

            publisher.publishEvent(new RefundSucceeded(
                    Ids.newId(),
                    refund.id(),
                    payment.id(),
                    refund.orderGroupId(),
                    refund.sellerOrderId(),
                    payment.buyerId(),
                    new Money(refund.amount(), refund.currency()),
                    refund.reason(),
                    Instant.now()));
            return true;
        }));
    }
}
