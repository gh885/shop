package com.shop.platform.payment.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.BizNo;
import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import com.shop.platform.payment.api.PaymentCommand;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.payment.api.SuspenseReason;
import com.shop.platform.payment.events.PaymentSucceeded;
import com.shop.platform.payment.internal.PaymentChannel;
import com.shop.platform.payment.mapper.PaymentOrderMapper;
import com.shop.platform.payment.mapper.SuspenseMapper;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

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
 *
 * <p><b>这个模块不认识 trade。</b> 应付金额由 trade 算好传进来（见 {@link PaymentCommand#create}），
 * payment 不做任何金额推导。这样依赖方向是单向 {@code trade → payment :: api}，
 * 而不是两个模块互相 import——那会成环，而环一旦存在两个模块就再也分不开了。
 */
@Component
public class PaymentService implements PaymentCommand {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    /** 支付单自身有效期上限。真正生效的是它和订单可付期限（create 的 payableUntil）的较早者。 */
    private static final Duration TTL = Duration.ofMinutes(30);

    private final PaymentOrderMapper payments;
    private final PaymentChannel channel;
    private final ApplicationEventPublisher publisher;
    private final RefundService refunds;
    private final SuspenseMapper suspense;
    private final TransactionTemplate transactionTemplate;

    public PaymentService(
            PaymentOrderMapper payments,
            PaymentChannel channel,
            ApplicationEventPublisher publisher,
            RefundService refunds,
            SuspenseMapper suspense,
            TransactionTemplate transactionTemplate) {
        this.payments = Objects.requireNonNull(payments, "payments");
        this.channel = Objects.requireNonNull(channel, "channel");
        this.publisher = Objects.requireNonNull(publisher, "publisher");
        this.refunds = Objects.requireNonNull(refunds, "refunds");
        this.suspense = Objects.requireNonNull(suspense, "suspense");
        this.transactionTemplate = Objects.requireNonNull(transactionTemplate, "transactionTemplate");
    }

    /** 退款委托给 {@link RefundService}：它自己带幂等键和渠道调用，不塞进这个类。 */
    @Override
    public Refund refund(UUID orderGroupId, UUID sellerOrderId, long amount, String currency, String reason) {
        return refunds.refund(orderGroupId, sellerOrderId, amount, currency, reason);
    }

    /** 挂账登记。给 trade 在 markPaid 输给超时关单后调——钱到的事实先记下，善后走管理端。 */
    @Override
    public void suspend(UUID paymentId, long arrivedAmount, String currency, SuspenseReason reason) {
        payments.find(paymentId).ifPresent(payment -> suspense.insert(reason, payment, arrivedAmount, currency));
    }

    /**
     * 发起支付。
     *
     * <p>金额是参数不是查询：payment 不认识 trade，也就没法自己算。
     * 传金额的是 trade（订单持有者），买家侧入口也在 trade，那边只收订单组 id。
     *
     * <p><b>不开事务，渠道调用必须在事务外。</b> {@code channel.createPayment} 是一次到渠道的
     * 远程调用，放在事务里等于占着连接和行锁等支付宝——慢网关 + 回调风暴能把连接池耗干。
     * 落单是单条 INSERT 自成事务，支付参数本来就是查完即用、不落库的返回值。
     */
    @Override
    public PaymentView create(UUID orderGroupId, UUID buyerId, long amount, String currency, Instant payableUntil) {
        if (amount <= 0) {
            throw BusinessException.badRequest("应付金额必须大于 0: " + amount);
        }
        Objects.requireNonNull(payableUntil, "payableUntil");

        // 支付单不能比订单可付窗口活得久。以前只锚 now+TTL：用户第 29 分才点支付，
        // 支付单活到第 59 分，而订单第 35 分就关了——渠道还在收一笔永远推进不了订单的钱。
        Instant expireAt = Instant.now().plus(TTL);
        if (payableUntil.isBefore(expireAt)) {
            expireAt = payableUntil;
        }
        if (!expireAt.isAfter(Instant.now())) {
            throw BusinessException.conflict("订单可付时间已过: " + orderGroupId);
        }

        // 同一订单组已有未过期的 pending 支付单时直接复用，不新建：用户反复点"去支付"
        // 不该堆出一串支付单。已过期但关单任务还没扫到的 pending 不复用——那是张死票。
        for (PaymentOrderMapper.PaymentRow existing : payments.findByGroup(orderGroupId)) {
            if (existing.status() == com.shop.platform.payment.model.PaymentStatus.PENDING
                    && existing.expireAt().isAfter(Instant.now())) {
                return view(existing, channel.createPayment(charge(existing)));
            }
        }

        UUID id = Ids.newId();
        String outTradeNo = BizNo.of("PAY", LocalDate.now(ZoneId.systemDefault()));
        PaymentOrderMapper.NewPayment payment = new PaymentOrderMapper.NewPayment(
                id, outTradeNo, buyerId, orderGroupId, channel.code(), outTradeNo, amount, amount, currency, expireAt);
        payments.insert(payment);

        PaymentOrderMapper.PaymentRow saved = payments.find(id).orElseThrow();
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
        PaymentChannel.CallbackResult result;
        try {
            result = channel.parseCallback(rawParams);
        } catch (PaymentChannel.InvalidCallbackException e) {
            // 对外只回 400 + 一句固定文案（原因是对攻击者的提示），但日志里必须有真原因，
            // 否则排查"回调为什么一直失败"时只剩一句"报文不合法"
            log.warn("支付回调被拒: channel={} reason={}", channel.code(), e.getTechnicalReason());
            throw e;
        }

        PaymentOrderMapper.PaymentRow payment = payments.findByOutTradeNo(result.outTradeNo())
                .orElseThrow(() -> BusinessException.notFound("支付单不存在: " + result.outTradeNo()));

        if (!payment.status().acceptsCallback()) {
            if (payment.status() == com.shop.platform.payment.model.PaymentStatus.SUCCESS) {
                // 已成功的重复回调：幂等跳过。这是幂等的第二道（第一道是状态前置条件）
                return new Confirmation(payment.id(), true, false, "支付单已成功，重复回调忽略");
            }
            if (result.success()) {
                // 迟到成功：钱确实到了渠道，但支付单已关/已失败，状态机不再接收它。
                // 回 success 让渠道停止重投（重投救不了任何东西——没有可执行的自动动作），
                // 但必须留痕：挂账待人查、人退。以前这里一行日志都没有，钱凭空消失。
                suspense.insert(SuspenseReason.LATE_CALLBACK, payment, result);
                log.error(
                        "迟到成功回调，已挂账：payment={} status={} txn={} amount={}",
                        payment.id(),
                        payment.status().dbValue(),
                        result.channelTxnId(),
                        result.amount());
                return new Confirmation(payment.id(), true, false, "支付单已终态，迟到成功已挂账待查");
            }
            return new Confirmation(
                    payment.id(), false, false, "支付单已是终态: " + payment.status().dbValue());
        }

        if (!result.success()) {
            payments.markFailed(payment.id(), result.rawPayload());
            return new Confirmation(payment.id(), false, false, "渠道报支付未成功");
        }

        // 金额比对只在这里做一次，别让 trade 和 clearing 各算一遍
        return applyPaid(payment, result, "支付成功", "金额不符，已挂账待查");
    }

    /**
     * 把渠道的"支付成功"落进状态机并发事件。**必须在事务里调用**：
     * markSuccess 与事件登记要同事务提交（outbox 语义）。
     */
    private Confirmation applyPaid(
            PaymentOrderMapper.PaymentRow payment,
            PaymentChannel.CallbackResult result,
            String okMessage,
            String mismatchMessage) {
        boolean matched = result.amount() == payment.expectedAmount();
        if (!payments.markSuccess(payment.id(), matched, result.channelTxnId(), result.rawPayload())) {
            // 并发回调：另一个请求先推进了，本次跳过
            return new Confirmation(payment.id(), true, false, "并发回调，已被另一个请求处理");
        }
        if (!matched) {
            // 钱到了但到得不对：挂账。trade 那边还会拒收一次（双保险），但这边先记下钱的事实
            suspense.insert(SuspenseReason.AMOUNT_MISMATCH, payment, result);
        }

        publisher.publishEvent(new PaymentSucceeded(
                Ids.newId(),
                payment.id(),
                payment.orderGroupId(),
                new Money(result.amount(), payment.currency()),
                new Money(payment.expectedAmount(), payment.currency()),
                matched,
                payment.channel(),
                result.channelTxnId(),
                Instant.now()));

        return new Confirmation(payment.id(), true, true, matched ? okMessage : mismatchMessage);
    }

    /**
     * 主动查单。用户说付了但回调没来时的唯一出路。
     *
     * <p>查单结果和回调走**同一条处理路**——两条路各走各的判定，迟早会不一致。
     *
     * <p>归属必须校验：这个接口会推进状态，不校验就等于任何人拿别人的支付单 id
     * 都能"帮别人确认收款"。查不到和不属于你返回同一个 404——区分两者等于送一个支付单探测器。
     *
     * <p><b>渠道查单在事务外</b>（远程调用不该占着连接和行锁），拿到回执后用短事务落状态。
     */
    @Override
    public Confirmation confirm(UUID paymentId, UUID buyerId) {
        PaymentOrderMapper.PaymentRow payment = payments.find(paymentId)
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

        return transactionTemplate.execute(status -> applyPaid(payment, result, "查单确认支付成功", "金额不符，已挂账待查"));
    }

    /** 超时关单：一条批量条件更新完成，多实例靠 SKIP LOCKED 不互抢。 */
    public int closeExpired(int limit) {
        return payments.closeExpiredBatch(limit);
    }

    /**
     * 按渠道商户订单号查支付单。回跳页用——支付宝只带 {@code out_trade_no}，不带我们的 id。
     *
     * <p>查不到就拒，不要"返个空对象让前端自己猜"。归属同样要校验：
     * {@code out_trade_no} 是可枚举的业务号，不校验就是一个人人能翻的支付单列表。
     */
    public PaymentView findViewByOutTradeNo(String outTradeNo, UUID buyerId) {
        PaymentOrderMapper.PaymentRow payment = payments.findByOutTradeNo(outTradeNo)
                .filter(row -> row.buyerId().equals(buyerId))
                .orElseThrow(() -> BusinessException.notFound("支付单不存在: " + outTradeNo));
        return view(payment, null);
    }

    private PaymentChannel.Charge charge(PaymentOrderMapper.PaymentRow payment) {
        return new PaymentChannel.Charge(
                payment.outTradeNo(), payment.expectedAmount(), "订单 " + payment.orderGroupId(), payment.expireAt());
    }

    private PaymentView view(PaymentOrderMapper.PaymentRow payment, String payUrl) {
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
}
