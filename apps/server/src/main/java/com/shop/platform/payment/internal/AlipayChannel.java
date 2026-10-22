package com.shop.platform.payment.internal;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.PublicKey;
import java.security.Signature;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * 支付宝渠道。**不引 SDK**——那套协议本质是「HTTP POST + RSA2 签名」，JDK 自带 {@link Signature} 就够。
 *
 * <p>省掉 SDK 换来三件事：
 *
 * <ul>
 *   <li>不加依赖，也就不跟着它升级、不看它的日志框架冲突
 *   <li>签名逻辑摊开在你眼前，出问题能自己查，而不是猜 SDK 里哪一步做了预编码
 *   <li>测试只需要一对本地 RSA 密钥，不依赖网络
 * </ul>
 *
 * <p>代价：报文格式和签名规则由我们自己维护。规则只有两条，写死在下面：
 *
 * <ol>
 *   <li>待签名串 = 非空参数按 key 字典序排，拼成 {@code k1=v1&k2=v2}，**去掉 {@code sign} 和 {@code sign_type}**
 *   <li>用渠道公钥做 SHA256withRSA 验签，签名值是 Base64
 * </ol>
 *
 * <p>回调里的 {@code trade_status} / {@code total_amount} 一律**不直接采信**：签名只证明"这报文是支付宝发的"，
 * 不证明"金额和我们这一单对得上"。金额比对在 {@code PaymentService} 里做。
 */
public class AlipayChannel implements PaymentChannel {

    private static final String SIGN_TYPE = "RSA2";

    private final String appId;
    private final PublicKey alipayPublicKey;
    private final String gatewayUrl;
    private final String notifyUrl;
    private final String returnUrl;
    private final HttpTransport transport;

    public AlipayChannel(
            String appId,
            PublicKey alipayPublicKey,
            String gatewayUrl,
            String notifyUrl,
            String returnUrl,
            HttpTransport transport) {
        this.appId = Objects.requireNonNull(appId, "appId");
        this.alipayPublicKey = Objects.requireNonNull(alipayPublicKey, "alipayPublicKey");
        this.gatewayUrl = Objects.requireNonNull(gatewayUrl, "gatewayUrl");
        this.notifyUrl = notifyUrl;
        this.returnUrl = returnUrl;
        this.transport = Objects.requireNonNull(transport, "transport");
    }

    @Override
    public String code() {
        return "alipay";
    }

    /**
     * 拼收银台跳转地址。
     *
     * <p>用「手机网站支付」的 {@code alipay.trade.wap.pay}：它只要求一个跳转 URL，不需要在下单时同步等结果，
     * 结果全部走异步回调。这正好符合"只认回调"的设计。
     *
     * <p><b>注意这里没签名。</b>真实签名要用应用私钥，而我们刻意不让私钥进这个类——私钥只该在发起请求那一步用到，
     * 由 {@link AlipayRequestSigner} 负责。这一版只返回未签名的参数表，接真渠道时补上。
     */
    @Override
    public String createPayment(Charge charge) {
        Map<String, String> params = new TreeMap<>();
        params.put("app_id", appId);
        params.put("method", "alipay.trade.wap.pay");
        params.put("charset", "utf-8");
        params.put("sign_type", SIGN_TYPE);
        params.put(
                "timestamp",
                java.time.LocalDateTime.now()
                        .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        params.put("version", "1.0");
        params.put("notify_url", notifyUrl);
        params.put("return_url", returnUrl);
        params.put(
                "biz_content",
                "{\"out_trade_no\":\"" + charge.outTradeNo() + "\",\"total_amount\":\""
                        + formatAmount(charge.amount()) + "\",\"subject\":\"" + charge.subject()
                        + "\",\"product_code\":\"QUICK_WAP_WAY\"}");
        return gatewayUrl + "?" + toQueryString(params);
    }

    @Override
    public CallbackResult parseCallback(Map<String, String> rawParams) {
        String sign = rawParams.get("sign");
        if (sign == null || sign.isBlank()) {
            throw new InvalidCallbackException("回调缺少 sign");
        }
        if (!verify(rawParams, sign)) {
            throw new InvalidCallbackException("回调验签失败");
        }

        String outTradeNo = rawParams.get("out_trade_no");
        if (outTradeNo == null || outTradeNo.isBlank()) {
            throw new InvalidCallbackException("回调缺少 out_trade_no");
        }

        // TRADE_SUCCESS 与 TRADE_FINISHED 都算付成功；WAIT_BUYER_PAY / TRADE_CLOSED 不算
        String status = rawParams.get("trade_status");
        boolean success = "TRADE_SUCCESS".equals(status) || "TRADE_FINISHED".equals(status);

        return new CallbackResult(
                outTradeNo,
                success,
                parseAmount(rawParams.get("total_amount")),
                rawParams.get("trade_no"),
                rawParams.toString());
    }

    /**
     * 主动查单：{@code alipay.trade.query}。
     *
     * <p>查单和回调必须走**同一条解析路**，否则两边的判定会出现微妙差异——比如一边认为 TRADE_FINISHED 成功、
     * 另一边只认 TRADE_SUCCESS。所以这里返回同一个 {@link CallbackResult}。
     */
    @Override
    public CallbackResult query(String outTradeNo) {
        Map<String, String> params = new TreeMap<>();
        params.put("app_id", appId);
        params.put("method", "alipay.trade.query");
        params.put("charset", "utf-8");
        params.put("sign_type", SIGN_TYPE);
        params.put(
                "timestamp",
                java.time.LocalDateTime.now()
                        .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        params.put("version", "1.0");
        params.put("biz_content", "{\"out_trade_no\":\"" + outTradeNo + "\"}");

        String body = transport.post(gatewayUrl, params);
        if (body == null || body.isBlank()) {
            return null;
        }
        // 查单响应也是要验签的报文，走同一个解析口
        Map<String, String> parsed = parseResponseFields(body);
        if (parsed.isEmpty()) {
            return null;
        }
        return parseCallback(parsed);
    }

    /**
     * 验签。规则：去掉 {@code sign} 和 {@code sign_type}，其余非空参数按 key 字典序拼 {@code k=v&k=v}。
     *
     * <p>这行 {@code k=v} 里<b>不做 URL 编码</b>——支付宝的规则是"取原始值"。解码交给 {@code HttpServletRequest}
     * 之前的那一层，所以进到这里已经是解码后的明文。
     */
    boolean verify(Map<String, String> params, String sign) {
        String content = canonical(params);
        try {
            Signature verifier = Signature.getInstance("SHA256withRSA");
            verifier.initVerify(alipayPublicKey);
            verifier.update(content.getBytes(StandardCharsets.UTF_8));
            return verifier.verify(java.util.Base64.getDecoder().decode(sign));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            // 签名格式不对和验签不通过是同一件事：都不许放行
            return false;
        }
    }

    /**
     * 待签名串。排序用 TreeMap，遍历稳定；空值按支付宝规则剔除。
     *
     * <p>{@code public} 是给 {@link AlipayRequestSigner} 用的：签名和验签必须用同一份拼串逻辑，
     * 两边各写一份迟早差一个空格，而那种 bug 只在生产签名失败时才暴露。
     */
    public static String canonical(Map<String, String> params) {
        return params.entrySet().stream()
                .filter(entry -> entry.getValue() != null && !entry.getValue().isEmpty())
                .filter(entry -> !"sign".equals(entry.getKey()) && !"sign_type".equals(entry.getKey()))
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("&"));
    }

    private static String toQueryString(Map<String, String> params) {
        return params.entrySet().stream()
                .filter(entry -> entry.getValue() != null)
                .map(entry -> java.net.URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8) + "="
                        + java.net.URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
    }

    /** 分 → 元，两位小数。支付宝要的是元，我们是分，这一层必须是唯一的换算点。 */
    public static String formatAmount(long cents) {
        return "%d.%02d".formatted(cents / 100, cents % 100);
    }

    /** 元 → 分。字符串解析，不走 double —— 0.1 + 0.2 那套在这里会直接算错钱。 */
    public static long parseAmount(String yuan) {
        if (yuan == null || yuan.isBlank()) {
            throw new InvalidCallbackException("回调缺少 total_amount");
        }
        String[] parts = yuan.split("\\.");
        long integer = Long.parseLong(parts[0]);
        long fraction = parts.length > 1 ? Long.parseLong((parts[1] + "00").substring(0, 2)) : 0;
        return integer * 100 + fraction;
    }

    /** 把支付宝的 JSON 响应摊平成参数表，好复用回调那条解析路。 */
    private static Map<String, String> parseResponseFields(String body) {
        Map<String, String> fields = new TreeMap<>();
        for (String key : new String[] {"out_trade_no", "trade_status", "total_amount", "trade_no", "code"}) {
            java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\"" + key + "\"\\s*:\\s*\"([^\"]*)\"")
                    .matcher(body);
            if (matcher.find()) {
                fields.put(key, matcher.group(1));
            }
        }
        return fields;
    }

    /** HTTP 出口。抽出来是为了测试能塞假传输，不打真网关。 */
    public interface HttpTransport {

        String post(String url, Map<String, String> form);
    }
}
