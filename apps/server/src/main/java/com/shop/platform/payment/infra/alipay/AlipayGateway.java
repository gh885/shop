package com.shop.platform.payment.infra.alipay;

import com.shop.platform.common.Money;
import com.shop.platform.payment.gateway.PaymentGateway;
import com.shop.platform.payment.gateway.PaymentGatewayException;
import com.shop.platform.payment.mapper.Payment;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 支付宝适配（技术适配，仅 payment 使用）。
 *
 * <p>边界职责：拼报文、签名、验响应、把渠道状态拍平成 {@link TradeQueryResult}。
 * 业务规则（能不能推进订单、流水怎么转）不在这里——那是 {@code PaymentService}。
 *
 * <p>不用官方 SDK：协议就是 form POST + RSA2，自己签能少背一串传递依赖与随之而来的 CVE 面；
 * 签名实现已验证过沙箱（签名被接受、响应能验），回归由 {@code AlipaySignTest} 钉住。
 *
 * <p><b>响应必须验签</b>：{@link #queryTrade} 的答案会直接决定订单是否推进，
 * 不验签等于相信任何能截获/伪造响应的人。
 */
@Slf4j
public class AlipayGateway implements PaymentGateway {

    private static final String METHOD_PAGE_PAY = "alipay.trade.page.pay";

    private static final String METHOD_QUERY = "alipay.trade.query";

    private static final String METHOD_REFUND = "alipay.trade.refund";

    private static final String SUCCESS_CODE = "10000";

    private static final String TRADE_NOT_EXIST = "ACQ.TRADE_NOT_EXIST";

    /** 渠道认为「钱已到账」的两种终态：TRADE_SUCCESS 可退款，TRADE_FINISHED 不可退 */
    private static final Set<String> PAID_STATUS = Set.of("TRADE_SUCCESS", "TRADE_FINISHED");

    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AlipayProperties props;

    private final RestClient restClient;

    private final ObjectMapper objectMapper;

    public AlipayGateway(AlipayProperties props, RestClient restClient, ObjectMapper objectMapper) {
        this.props = props;
        this.restClient = restClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public String channel() {
        return Payment.CHANNEL_ALIPAY;
    }

    @Override
    public boolean available() {
        return props.available();
    }

    /**
     * 创建电脑网站支付交易，返回收银台跳转地址。
     *
     * <p>用 GET 拼参数而不是返回自动提交的 form：前端只要一次 {@code location.href}，
     * 不必把 HTML 注入页面（也就不用给这个响应开口子）。
     */
    @Override
    public String createTrade(TradeParams request) {
        Map<String, String> biz = new LinkedHashMap<>();
        biz.put("out_trade_no", request.outTradeNo());
        biz.put("total_amount", yuan(request.amount()));
        biz.put("subject", request.subject());
        biz.put("product_code", props.getProductCode());

        Map<String, String> params = baseParams(METHOD_PAGE_PAY);
        params.put("biz_content", toJson(biz));
        if (hasText(props.getReturnUrl())) {
            params.put("return_url", props.getReturnUrl());
        }
        if (hasText(props.getNotifyUrl())) {
            params.put("notify_url", props.getNotifyUrl());
        }
        params.put("sign", AlipaySign.sign(params, props.getPrivateKey()));
        return props.getGatewayUrl() + "?" + encode(params);
    }

    /**
     * 查询交易真相。返回未支付是正常结果（买家还没付），查询本身失败才抛。
     *
     * <p>「交易不存在」也按未支付处理：买家点支付后尚未完成时沙箱就是查不到，
     * 把它当异常会让收银台把一次没付当成系统故障。
     */
    @Override
    public TradeQueryResult queryTrade(String outTradeNo) {
        Map<String, String> biz = new LinkedHashMap<>();
        biz.put("out_trade_no", outTradeNo);

        Map<String, String> params = baseParams(METHOD_QUERY);
        params.put("biz_content", toJson(biz));

        JsonNode root = post(params, "alipay_trade_query_response");
        String code = root.path("code").asString("");
        if (TRADE_NOT_EXIST.equals(root.path("sub_code").asString(""))) {
            return new TradeQueryResult(false, null);
        }
        if (!SUCCESS_CODE.equals(code)) {
            throw new PaymentGatewayException("支付宝查询失败: code=" + code + ", sub_code="
                    + root.path("sub_code").asString(""));
        }
        String tradeStatus = root.path("trade_status").asString("");
        boolean paid = PAID_STATUS.contains(tradeStatus);
        return new TradeQueryResult(paid, paid ? root.path("trade_no").asString("") : null);
    }

    /**
     * 提交退款。支付宝退款是「受理」语义：返回 fund_change=Y 表示资金已变动，
     * 调用方仍应以查询/对账为准，不能把受理当完成。
     */
    @Override
    public RefundOutcome refund(RefundParams request) {
        // out_request_no 是渠道幂等键：同一张退款单重试必须被识别为同一笔，换号就等于再退一次
        String outRequestNo = request.refundNo();
        Map<String, String> biz = new LinkedHashMap<>();
        biz.put("out_trade_no", request.paymentId().toString());
        biz.put("refund_amount", yuan(request.amount()));
        biz.put("refund_reason", request.reason());
        biz.put("out_request_no", outRequestNo);

        Map<String, String> params = baseParams(METHOD_REFUND);
        params.put("biz_content", toJson(biz));

        JsonNode root = post(params, "alipay_trade_refund_response");
        String code = root.path("code").asString("");
        if (!SUCCESS_CODE.equals(code)) {
            throw new PaymentGatewayException("支付宝退款失败: code=" + code + ", sub_code="
                    + root.path("sub_code").asString(""));
        }
        log.info(
                "[PAYMENT] 支付宝退款受理, paymentId={}, outRequestNo={}, fundChange={}",
                request.paymentId(),
                outRequestNo,
                root.path("fund_change").asString(""));
        return new RefundOutcome(outRequestNo);
    }

    /** POST 一个签名请求，验签后返回 xxx_response 节点 */
    private JsonNode post(Map<String, String> params, String responseKey) {
        params.put("sign", AlipaySign.sign(params, props.getPrivateKey()));

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        params.forEach(form::add);
        String body;
        try {
            body = restClient
                    .post()
                    .uri(props.getGatewayUrl())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(String.class);
        } catch (RuntimeException e) {
            throw new PaymentGatewayException("支付宝网关请求失败: " + e.getMessage(), e);
        }
        if (!hasText(body)) {
            throw new PaymentGatewayException("支付宝网关返回空响应");
        }

        String signedContent = extractObject(body, responseKey);
        String responseSign = extractString(body, "sign");
        if (!AlipaySign.verify(signedContent, responseSign, props.getPublicKey())) {
            throw new PaymentGatewayException("支付宝响应验签失败：拒绝相信未签名或签名不符的支付结果");
        }
        return readTree(signedContent);
    }

    private Map<String, String> baseParams(String method) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("app_id", props.getAppId());
        params.put("method", method);
        params.put("format", "JSON");
        params.put("charset", "utf-8");
        params.put("sign_type", "RSA2");
        params.put("timestamp", OffsetDateTime.now(ZoneId.of("Asia/Shanghai")).format(TIMESTAMP));
        params.put("version", "1.0");
        return params;
    }

    private String toJson(Map<String, String> biz) {
        try {
            return objectMapper.writeValueAsString(biz);
        } catch (RuntimeException e) {
            throw new PaymentGatewayException("支付宝业务参数序列化失败", e);
        }
    }

    private JsonNode readTree(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (RuntimeException e) {
            throw new PaymentGatewayException("支付宝响应解析失败", e);
        }
    }

    /** 分 → 元，两位小数。用 long 构造 BigDecimal，不经过 double */
    private static String yuan(Money money) {
        return BigDecimal.valueOf(money.amount(), 2).toPlainString();
    }

    private static String encode(Map<String, String> params) {
        StringBuilder sb = new StringBuilder();
        params.forEach((k, v) -> {
            if (v == null || v.isEmpty()) {
                return;
            }
            if (sb.length() > 0) {
                sb.append('&');
            }
            sb.append(urlEncode(k)).append('=').append(urlEncode(v));
        });
        return sb.toString();
    }

    private static String urlEncode(String value) {
        // URLEncoder 把空格编成 +，支付宝要求 %20
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    /** 取 "key":{...} 的原文（含花括号）：括号平衡扫描，尊重字符串与转义 */
    private static String extractObject(String json, String key) {
        String needle = "\"" + key + "\"";
        int at = json.indexOf(needle);
        if (at < 0) {
            return null;
        }
        int start = json.indexOf('{', at + needle.length());
        if (start < 0) {
            return null;
        }
        int depth = 0;
        boolean inString = false;
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (inString) {
                if (c == '\\') {
                    i++;
                } else if (c == '"') {
                    inString = false;
                }
                continue;
            }
            if (c == '"') {
                inString = true;
            } else if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    return json.substring(start, i + 1);
                }
            }
        }
        return null;
    }

    /** 取顶层 "sign":"..." 的值 */
    private static String extractString(String json, String key) {
        String needle = "\"" + key + "\":\"";
        int at = json.lastIndexOf(needle);
        if (at < 0) {
            return null;
        }
        int start = at + needle.length();
        int end = json.indexOf('"', start);
        return end < 0 ? null : json.substring(start, end);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
