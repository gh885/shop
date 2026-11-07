package com.shop.platform.payment.internal;

import com.shop.platform.infra.db.JsonColumns;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.PublicKey;
import java.security.Signature;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.stream.Collectors;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

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

    /** 支付宝对 time_expire 的比对口径是北京时间，与部署时区无关。 */
    private static final DateTimeFormatter TIME_EXPIRE =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(java.time.ZoneId.of("Asia/Shanghai"));

    /** 每个请求头部的 timestamp，同样是北京时间字符串。 */
    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final String appId;
    private final PublicKey alipayPublicKey;
    private final AlipayRequestSigner signer;
    private final String gatewayUrl;
    private final String notifyUrl;
    private final String returnUrl;
    private final HttpTransport transport;

    /**
     * 不带签名器的构造器，只给本地测试用：{@link #createPayment} 会退回未签名参数表，
     * {@link #refund} 直接拒。生产装配必须走带签名器的那个——未签名的请求网关不收。
     */
    public AlipayChannel(
            String appId,
            PublicKey alipayPublicKey,
            String gatewayUrl,
            String notifyUrl,
            String returnUrl,
            HttpTransport transport) {
        this(appId, alipayPublicKey, null, gatewayUrl, notifyUrl, returnUrl, transport);
    }

    /** 生产构造：请求签名由 {@link AlipayRequestSigner} 负责，私钥不进这个类。 */
    public AlipayChannel(
            String appId,
            PublicKey alipayPublicKey,
            AlipayRequestSigner signer,
            String gatewayUrl,
            String notifyUrl,
            String returnUrl,
            HttpTransport transport) {
        this.appId = Objects.requireNonNull(appId, "appId");
        this.alipayPublicKey = Objects.requireNonNull(alipayPublicKey, "alipayPublicKey");
        this.signer = signer;
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
     * <p>请求必须签名（未签名的跳转地址网关直接拒收）：待签名串与验签共用同一份 {@link #canonical}，
     * 去掉 {@code sign} 和 {@code sign_type} 后按 key 字典序拼串，应用私钥签、Base64 编码。
     * 私钥只在 {@link AlipayRequestSigner} 里出现，这里只拿到签名结果。
     */
    @Override
    public String createPayment(Charge charge) {
        Map<String, String> params = baseParams("alipay.trade.wap.pay");
        params.put("notify_url", notifyUrl);
        params.put("return_url", returnUrl);
        // biz_content 用 Jackson 构造：subject 是用户输入，手拼字符串遇到引号/反斜杠就是非法报文
        ObjectNode biz = JsonColumns.mapper().createObjectNode();
        biz.put("out_trade_no", charge.outTradeNo());
        biz.put("total_amount", formatAmount(charge.amount()));
        biz.put("subject", charge.subject());
        biz.put("product_code", "QUICK_WAP_WAY");
        biz.put("time_expire", TIME_EXPIRE.format(charge.expiresAt()));
        params.put("biz_content", JsonColumns.write(biz));
        return gatewayUrl + "?" + toQueryString(signed(params));
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
     * <p>查单和回调的**业务判定**必须一致（都认 {@code TRADE_SUCCESS} / {@code TRADE_FINISHED} 为成功），
     * 所以两边返回同一个 {@link CallbackResult}。但**解析路径必须分开**：
     * 回调是渠道主动 POST 上来的报文，第一步就得验 {@code sign}；
     * 查单是我们发请求后拿到的应答，字段集不同。
     *
     * <p>早期版本把响应摊平成参数表后直接喂给 {@link #parseCallback}，结果每次都抛「回调缺少 sign」，
     * 查单永远失败、错误还被兜底成 500。现在拆开：查单只校验业务字段，签名验证留给回调。
     */
    @Override
    public CallbackResult query(String outTradeNo) {
        Map<String, String> params = baseParams("alipay.trade.query");
        ObjectNode biz = JsonColumns.mapper().createObjectNode();
        biz.put("out_trade_no", outTradeNo);
        params.put("biz_content", JsonColumns.write(biz));

        String body = transport.post(gatewayUrl, signed(params));
        if (body == null || body.isBlank()) {
            return null;
        }
        Map<String, String> parsed = parseResponseFields(body, "alipay_trade_query_response", QUERY_RESPONSE_KEYS);
        if (parsed.isEmpty()) {
            return null;
        }

        // 支付宝把业务错误也放在 200 里：code 不是 10000 就是没查到/参数错，别当成功
        String code = parsed.get("code");
        if (code != null && !"10000".equals(code)) {
            return null;
        }
        String returned = parsed.get("out_trade_no");
        if (returned == null || returned.isBlank()) {
            return null;
        }
        // 查单响应里没有 sign（它不是回调），所以不能走 parseCallback；只取业务事实
        String status = parsed.get("trade_status");
        boolean success = "TRADE_SUCCESS".equals(status) || "TRADE_FINISHED".equals(status);
        String amount = parsed.get("total_amount");
        return new CallbackResult(
                returned,
                success,
                amount == null || amount.isBlank() ? 0L : parseAmount(amount),
                parsed.get("trade_no"),
                body);
    }

    /**
     * 同步退款：{@code alipay.trade.refund}。退款是同步接口——应答 {@code code=10000} 就是受理成功，
     * 没有"受理了等通知"的第二段，所以直接给 {@link RefundResult}；判成功之后的状态推进
     * （CAS 置 success、发 {@code RefundSucceeded}）仍是 {@code RefundService} 的事。
     *
     * <p>{@code out_request_no} 是渠道幂等键：同一笔退款单重试永远用同一个号，渠道对同号重放
     * 返回 {@code fund_change=N}，钱只动一次。
     *
     * <p>应答金额对不上就不算成功：渠道退的和我们要求退的不是一笔钱，宁可留 pending 人工看。
     *
     * <p>应答签名不验（和 {@link #query} 同一取舍）：这是我们在 TLS 保护下主动发起请求拿到的应答，
     * 不是渠道主动推上来的不可信报文，验签规则是给回调那条入口准备的。
     */
    @Override
    public RefundResult refund(Refund refund) {
        if (signer == null) {
            throw new UnsupportedOperationException("渠道 alipay 未配置应用私钥，无法发起退款");
        }
        Map<String, String> params = baseParams("alipay.trade.refund");
        ObjectNode biz = JsonColumns.mapper().createObjectNode();
        biz.put("out_trade_no", refund.outTradeNo());
        biz.put("refund_amount", formatAmount(refund.amount()));
        biz.put("out_request_no", refund.outRefundNo());
        params.put("biz_content", JsonColumns.write(biz));

        String body = transport.post(gatewayUrl, signed(params));
        if (body == null || body.isBlank()) {
            return new RefundResult(false, null, body);
        }
        Map<String, String> parsed = parseResponseFields(body, "alipay_trade_refund_response", REFUND_RESPONSE_KEYS);
        if (parsed.isEmpty()) {
            return new RefundResult(false, null, body);
        }
        // 支付宝把业务错误也放在 200 里：code 不是 10000 就是没退成/参数错
        if (!"10000".equals(parsed.get("code"))) {
            return new RefundResult(false, null, body);
        }
        String returned = parsed.get("out_trade_no");
        if (returned == null || returned.isBlank()) {
            return new RefundResult(false, null, body);
        }
        String fee = parsed.get("refund_fee");
        if (fee != null && !fee.isBlank() && parseAmount(fee) != refund.amount()) {
            return new RefundResult(false, null, body);
        }
        return new RefundResult(true, parsed.get("trade_no"), body);
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

    /** 每个网关请求公共的头部参数；biz_content 和渠道特有字段由调用方补。 */
    private Map<String, String> baseParams(String method) {
        Map<String, String> params = new TreeMap<>();
        params.put("app_id", appId);
        params.put("method", method);
        params.put("charset", "utf-8");
        params.put("sign_type", SIGN_TYPE);
        params.put("timestamp", LocalDateTime.now().format(TIMESTAMP));
        params.put("version", "1.0");
        return params;
    }

    /** 生产带签名器就签；没带（测试构造器）保持未签名。 */
    private Map<String, String> signed(Map<String, String> params) {
        return signer == null ? params : signer.signParams(params);
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
        return BigDecimal.valueOf(cents, 2).toPlainString();
    }

    /** 元 → 分。字符串解析，不走 double —— 0.1 + 0.2 那套在这里会直接算错钱。 */
    public static long parseAmount(String yuan) {
        if (yuan == null || yuan.isBlank()) {
            throw new InvalidCallbackException("回调缺少 total_amount");
        }
        try {
            return new BigDecimal(yuan)
                    .movePointRight(2)
                    .setScale(0, RoundingMode.UNNECESSARY)
                    .longValueExact();
        } catch (NumberFormatException | ArithmeticException e) {
            // 多于两位小数（丢厘）与不是数字的串都拒绝：悄悄截断和悄悄凑整都是在动钱
            throw new InvalidCallbackException("total_amount 不是两位小数的金额: " + yuan);
        }
    }

    /** 查单响应里要取的业务字段。 */
    private static final String[] QUERY_RESPONSE_KEYS = {
        "out_trade_no", "trade_status", "total_amount", "trade_no", "code"
    };

    /** 退款应答里要取的业务字段。 */
    private static final String[] REFUND_RESPONSE_KEYS = {"out_trade_no", "refund_fee", "trade_no", "code"};

    /**
     * 把支付宝的 JSON 响应摊平成参数表，好复用回调那条解析路。
     *
     * <p>业务体在 {@code alipay_trade_*_response} 节点里；解析不了（网关错误页等）一律当
     * "没查到"返回空表——别让渠道侧的一次抖动变成 500。
     */
    private static Map<String, String> parseResponseFields(String body, String nodeName, String[] keys) {
        JsonNode root;
        try {
            root = JsonColumns.mapper().readTree(body);
        } catch (RuntimeException e) {
            return Map.of();
        }
        JsonNode node = root.path(nodeName);
        if (!node.isObject()) {
            node = root;
        }
        Map<String, String> fields = new TreeMap<>();
        for (String key : keys) {
            JsonNode value = node.get(key);
            if (value != null && !value.isNull()) {
                fields.put(key, value.asString());
            }
        }
        return fields;
    }

    /** HTTP 出口。抽出来是为了测试能塞假传输，不打真网关。 */
    public interface HttpTransport {

        String post(String url, Map<String, String> form);
    }
}
