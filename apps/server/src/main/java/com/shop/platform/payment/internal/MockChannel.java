package com.shop.platform.payment.internal;

import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import tools.jackson.databind.json.JsonMapper;

/**
 * 本地调试用的渠道：签什么都是对的，付款立刻成功。
 *
 * <p>存在的理由：业务状态机（幂等、超时、金额不符、重复回调）和渠道协议是两件事。
 * 用这个渠道，可以先把"下单 → 支付 → 发货"整条链路跑通，全部验完再换真渠道——
 * 那时如果出问题，就只可能是签名或报文，不用再怀疑业务逻辑。
 *
 * <p><b>它记住自己收过多少钱</b>（{@link #createPayment} 时登记）。不记的话 {@link #query} 只能返回 0，
 * 而 0 和订单应付一比就是"金额不符"——每一笔正常支付都会被拒，这个渠道等于不能用。
 *
 * <p><b>它只在 {@code shop.payment.channel=mock} 时被装配</b>，生产不会出现。
 * 装配点在 {@code PaymentChannelConfig}，那里同时校验了"非 mock 渠道必须配齐密钥"。
 */
public class MockChannel implements PaymentChannel {

    /** 假的渠道流水号前缀，一眼能看出这单没真付钱。 */
    private static final String MOCK_TXN_PREFIX = "MOCK";

    /** 回调报文要落 jsonb（channel_payload / 挂账 raw_payload），必须是真 JSON。 */
    private static final JsonMapper JSON = JsonMapper.builder().build();

    /**
     * 下单时登记的应付金额。
     *
     * <p>进程重启会丢——mock 就是这样，丢了之后回调只能按报文里的 {@code amount} 走，
     * 报文里也没有就是 0，会判金额不符。这是刻意的：宁可让它明显不对，也不要悄悄"当成功"。
     */
    private final Map<String, Long> chargedAmounts = new ConcurrentHashMap<>();

    private final long successAmountOverride;

    /** 默认按订单应付金额成功。 */
    public MockChannel() {
        this(-1);
    }

    /**
     * @param successAmountOverride 让回调报一个和订单不一样的金额（分），用来验"金额不符进 suspense"。
     *     传负数表示按订单金额成功
     */
    public MockChannel(long successAmountOverride) {
        this.successAmountOverride = successAmountOverride;
    }

    @Override
    public String code() {
        return "mock";
    }

    /** 不需要跳转：前端拿到支付单直接调 {@code /confirm} 就完成了。 */
    @Override
    public String createPayment(Charge charge) {
        chargedAmounts.put(charge.outTradeNo(), charge.amount());
        return null;
    }

    /** mock 退款永远成功，流水号带前缀，一眼能看出这单没真退钱。 */
    @Override
    public RefundResult refund(Refund refund) {
        return new RefundResult(true, MOCK_TXN_PREFIX + "-REFUND-" + refund.outRefundNo(), "{}");
    }

    /**
     * 解析回调。{@code out_trade_no} 必须由调用方带上，否则不知道在确认哪一单。
     *
     * <p>金额优先级：显式覆盖 > 下单时登记的 > 报文里的 {@code amount} > 0。
     */
    @Override
    public CallbackResult parseCallback(Map<String, String> rawParams) {
        String outTradeNo = rawParams.get("out_trade_no");
        if (outTradeNo == null || outTradeNo.isBlank()) {
            throw new InvalidCallbackException("mock 回调缺少 out_trade_no");
        }
        return new CallbackResult(
                outTradeNo,
                true,
                amountOf(outTradeNo, rawParams),
                MOCK_TXN_PREFIX + "-" + outTradeNo,
                JSON.writeValueAsString(rawParams));
    }

    /** 查单：mock 世界里钱从没失败过，所以永远"查到了且成功"。 */
    @Override
    public CallbackResult query(String outTradeNo) {
        Objects.requireNonNull(outTradeNo, "outTradeNo");
        return new CallbackResult(
                outTradeNo, true, amountOf(outTradeNo, Map.of()), MOCK_TXN_PREFIX + "-" + outTradeNo, "{}");
    }

    private long amountOf(String outTradeNo, Map<String, String> rawParams) {
        if (successAmountOverride >= 0) {
            return successAmountOverride;
        }
        Long charged = chargedAmounts.get(outTradeNo);
        if (charged != null) {
            return charged;
        }
        String amount = rawParams.get("amount");
        return amount == null || amount.isBlank() ? 0L : Long.parseLong(amount);
    }
}
