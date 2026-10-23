package com.shop.platform.payment.service;

import com.shop.platform.common.id.BizNo;
import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import com.shop.platform.payment.api.PaymentCommand;
import com.shop.platform.payment.events.RefundSucceeded;
import com.shop.platform.payment.internal.PaymentChannel;
import com.shop.platform.payment.mapper.PaymentOrderStore;
import com.shop.platform.payment.mapper.RefundOrderStore;
import com.shop.platform.payment.model.PaymentStatus;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

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
 */
@Component
public class RefundService {

    private static final Logger log = LoggerFactory.getLogger(RefundService.class);

    private final PaymentOrderStore payments;
    private final RefundOrderStore refunds;
    private final PaymentChannel channel;
    private final ApplicationEventPublisher publisher;

    public RefundService(
            PaymentOrderStore payments,
            RefundOrderStore refunds,
            PaymentChannel channel,
            ApplicationEventPublisher publisher) {
        this.payments = Objects.requireNonNull(payments, "payments");
        this.refunds = Objects.requireNonNull(refunds, "refunds");
        this.channel = Objects.requireNonNull(channel, "channel");
        this.publisher = Objects.requireNonNull(publisher, "publisher");
    }

    public PaymentCommand.Refund refund(
            UUID orderGroupId, UUID sellerOrderId, long amount, String currency, String reason) {
        PaymentOrderStore.PaymentRow payment = payments.findByGroup(orderGroupId).stream()
                .filter(row -> row.status() == PaymentStatus.SUCCESS || row.status() == PaymentStatus.REFUNDED)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("订单没有成功的支付单: " + orderGroupId));

        refunds.insert(
                Ids.newId(),
                BizNo.of("RF", LocalDate.now()),
                payment.id(),
                orderGroupId,
                sellerOrderId,
                amount,
                currency,
                reason);

        RefundOrderStore.RefundRow refund = refunds.findByBiz(payment.id(), sellerOrderId, reason)
                .orElseThrow(() -> new IllegalStateException("退款单插入后读不到: " + reason));
        if ("success".equals(refund.status())) {
            return new PaymentCommand.Refund(refund.id(), true);
        }

        PaymentChannel.RefundResult result;
        try {
            result =
                    channel.refund(new PaymentChannel.Refund(refund.refundNo(), payment.outTradeNo(), refund.amount()));
        } catch (RuntimeException e) {
            log.warn("渠道退款异常，留在 pending：refund={} reason={}", refund.id(), reason, e);
            return new PaymentCommand.Refund(refund.id(), false);
        }
        if (!result.success()) {
            log.warn("渠道未受理退款：refund={} reason={}", refund.id(), reason);
            return new PaymentCommand.Refund(refund.id(), false);
        }
        if (!refunds.markSuccess(refund.id(), result.channelRefundId())) {
            // 并发下另一个请求先退了：它已经发过事件，这里不能再发
            return new PaymentCommand.Refund(refund.id(), true);
        }

        publisher.publishEvent(new RefundSucceeded(
                Ids.newId(),
                refund.id(),
                payment.id(),
                orderGroupId,
                sellerOrderId,
                new Money(refund.amount(), refund.currency()),
                reason,
                Instant.now()));

        return new PaymentCommand.Refund(refund.id(), true);
    }
}
