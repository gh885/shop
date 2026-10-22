package com.shop.platform.payment.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.BizNo;
import com.shop.platform.common.id.Ids;
import com.shop.platform.payment.api.PaymentCommand;
import com.shop.platform.payment.api.PaymentCommand.Confirmation;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.payment.events.PaymentSucceeded;
import com.shop.platform.payment.internal.PaymentChannel;
import com.shop.platform.payment.mapper.PaymentOrderStore;
import com.shop.platform.trade.api.TradeQuery;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 发起支付与处理回调。
 *
 * <p>三条不能改的：
 *
 * <ul>
 *   <li><b>只认渠道回调</b>：买家点"我已支付"不算数
 *   <li><b>金额不符不改订单、不忽略回调</b>：钱确实到了但到得不对，只能挂账等人查
 *   <li><b>回调幂等靠状态前置条件</b>：{@code status = 'pending'}，重放影响 0 行就跳过
 * </ul>
 */
@Component
public class PaymentService implements PaymentCommand {

    /** 支付单有效期。比订单的 30 分钟短一点：超时的支付单没有任何意义。 */
    private static final Duration TTL = Duration.ofMinutes(30);

    private final PaymentOrderStore payments;
    private final PaymentChannel channel;
    private final TradeQuery trades;
    private final ApplicationEventPublisher publisher;
    private final ObjectMapper json = JsonMapper.builder().build();

    public PaymentService(
            PaymentOrderStore payments,
            PaymentChannel channel,
            TradeQuery trades,
            ApplicationEventPublisher publisher) {
        this.payments = Objects.requireNonNull(payments, "payments");
        this.channel = Objects.requireNonNull(channel, "channel");
        this.trades = Objects.requireNonNull(trades, "trades");
        this.publisher = Objects.requireNonNull(publisher, "publisher");
    }

    @Override
    @Transactional
    public PaymentView create(UUID orderGroupId, UUID buyerId) {
        // 应付金额只能从 trade 读，不许调用方传——传了就能编一个金额去付
        TradeQuery.Payable payable = trades.findPayable(orderGroupId)
                .orElseThrow(() -> BusinessException.notFound("订单不存在: " + orderGroupId));

        if (!payable.buyerId().equals(buyerId)) {
            throw BusinessException.forbidden("只能支付自己的订单");
        }
        if (!payable.payableNow()) {
            throw BusinessException.conflict("订单已关闭或已支付，不能再次发起支付: " + orderGroupId);
        }

        // 同一订单组已有 pending 支付单时直接复用，不新建：用户反复点"去支付"不该堆出一串支付单
        for (PaymentOrderStore.PaymentRow existing : payments.findByGroup(orderGroupId)) {
            if (existing.status() == com.shop.platform.payment.model.PaymentStatus.PENDING) {
                return view(existing, channel.createPayment(charge(existing)));
            }
        }

        UUID id = Ids.newId();
        String outTradeNo = BizNo.of("PAY", LocalDate.now(ZoneId.systemDefault()));
        PaymentOrderStore.NewPayment payment = new PaymentOrderStore.NewPayment(
                id,
                outTradeNo,
                buyerId,
                orderGroupId,
                channel.code(),
                outTradeNo,
                payable.payableAmount(),
                payable.payableAmount(),
                payable.currency(),
                Instant.now().plus(TTL));
        payments.insert(payment);

        PaymentOrderStore.PaymentRow saved = payments.find(id).orElseThrow();
        return view(saved, channel.createPayment(charge(saved)));
    }

    /**
     * 处理渠道回调。**签名不过直接拒，金额不符标记 matched=false。**
     *
     * <p>回调里带的 {@code trade_status} / {@code total_amount} 不直接采信：签名只证明"报文是渠道发的"，
     * 不证明"金额和我们这一单对得上"。
     */
    @Transactional
    public Confirmation handleCallback(Map<String, String> rawParams) {
        PaymentChannel.CallbackResult result = channel.parseCallback(rawParams);

        PaymentOrderStore.PaymentRow payment = payments.findByOutTradeNo(result.outTradeNo())
                .orElseThrow(() -> BusinessException.notFound("支付单不存在: " + result.outTradeNo()));

        if (!payment.status().acceptsCallback()) {
            // 已终态的再来回调只记不入账。这是幂等的第二道（第一道是状态前置条件）
            return new Confirmation(
                    payment.id(),
                    payment.status() == com.shop.platform.payment.model.PaymentStatus.SUCCESS,
                    false,
                    "支付单已是终态: " + payment.status().dbValue());
        }

        if (!result.success()) {
            payments.markFailed(payment.id(), result.rawPayload());
            return new Confirmation(payment.id(), false, false, "渠道报支付未成功");
        }

        // 金额比对只在这里做一次，别让 trade 和 clearing 各算一遍
        boolean matched = result.amount() == payment.expectedAmount();
        if (!payments.markSuccess(payment.id(), matched, result.channelTxnId(), result.rawPayload())) {
            // 并发回调：另一个请求先推进了，本次跳过
            return new Confirmation(payment.id(), true, false, "并发回调，已被另一个请求处理");
        }

        publisher.publishEvent(new PaymentSucceeded(
                Ids.newId(),
                payment.id(),
                payment.orderGroupId(),
                result.amount(),
                payment.expectedAmount(),
                matched,
                payment.channel(),
                result.channelTxnId(),
                Instant.now()));

        return new Confirmation(payment.id(), true, true, matched ? "支付成功" : "金额不符，已挂账待查");
    }

    /**
     * 主动查单。用户说付了但回调没来时的唯一出路。
     *
     * <p>查单结果和回调走**同一条处理路**——两条路各走各的判定，迟早会不一致。
     *
     * <p>归属必须校验：这个接口会推进状态，不校验就等于任何人拿别人的支付单 id
     * 都能"帮别人确认收款"。查不到和不属于你返回同一个 404——区分两者等于送一个支付单探测器。
     */
    @Override
    @Transactional
    public Confirmation confirm(UUID paymentId, UUID buyerId) {
        PaymentOrderStore.PaymentRow payment = payments.find(paymentId)
                .filter(row -> row.buyerId().equals(buyerId))
                .orElseThrow(() -> BusinessException.notFound("支付单不存在: " + paymentId));

        if (!payment.status().acceptsCallback()) {
            boolean alreadyPaid = payment.status() == com.shop.platform.payment.model.PaymentStatus.SUCCESS;
            return new Confirmation(
                    payment.id(),
                    alreadyPaid,
                    false,
                    "已是终态: " + payment.status().dbValue());
        }

        PaymentChannel.CallbackResult result = channel.query(payment.outTradeNo());
        if (result == null) {
            return new Confirmation(payment.id(), false, false, "渠道查不到这笔支付");
        }
        if (!result.success()) {
            return new Confirmation(payment.id(), false, false, "渠道报支付未成功");
        }

        boolean matched = result.amount() == payment.expectedAmount();
        if (!payments.markSuccess(payment.id(), matched, result.channelTxnId(), result.rawPayload())) {
            return new Confirmation(payment.id(), true, false, "并发处理，已被另一个请求推进");
        }

        publisher.publishEvent(new PaymentSucceeded(
                Ids.newId(),
                payment.id(),
                payment.orderGroupId(),
                result.amount(),
                payment.expectedAmount(),
                matched,
                payment.channel(),
                result.channelTxnId(),
                Instant.now()));

        return new Confirmation(payment.id(), true, true, matched ? "查单确认支付成功" : "金额不符，已挂账待查");
    }

    /** 超时关单：支付单过期后不再接受回调。 */
    @Transactional
    public int closeExpired(int limit) {
        int closed = 0;
        for (PaymentOrderStore.PaymentRow payment : payments.findExpired(limit)) {
            if (payments.markClosed(payment.id())) {
                closed++;
            }
        }
        return closed;
    }

    /**
     * 按渠道商户订单号查支付单。回跳页用——支付宝只带 {@code out_trade_no}，不带我们的 id。
     *
     * <p>查不到就拒，不要"返个空对象让前端自己猜"。归属同样要校验：
     * {@code out_trade_no} 是可枚举的业务号，不校验就是一个人人能翻的支付单列表。
     */
    public PaymentView findViewByOutTradeNo(String outTradeNo, UUID buyerId) {
        PaymentOrderStore.PaymentRow payment = payments.findByOutTradeNo(outTradeNo)
                .filter(row -> row.buyerId().equals(buyerId))
                .orElseThrow(() -> BusinessException.notFound("支付单不存在: " + outTradeNo));
        return view(payment, null);
    }

    private PaymentChannel.Charge charge(PaymentOrderStore.PaymentRow payment) {
        return new PaymentChannel.Charge(
                payment.outTradeNo(), payment.expectedAmount(), "订单 " + payment.orderGroupId(), null, null);
    }

    private PaymentView view(PaymentOrderStore.PaymentRow payment, String payUrl) {
        return new PaymentView(
                payment.id(),
                payment.payNo(),
                payment.orderGroupId(),
                payment.expectedAmount(),
                payment.currency(),
                payment.status().name(),
                payment.expireAt(),
                payUrl);
    }

    private String writeJson(Object value) {
        return value == null ? "null" : json.writeValueAsString(value);
    }
}
