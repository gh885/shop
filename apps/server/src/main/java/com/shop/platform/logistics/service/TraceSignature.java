package com.shop.platform.logistics.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * 轨迹推送的 HMAC-SHA256 验签。
 *
 * <p>签名串 = 原始请求体 + "\n" + 时间戳（毫秒）——不搞"按字段排序再拼串"的规范化，
 * 那种格式两边各实现一遍，编码差异（空格、百分号、中文）能让验签永远对不上。
 * 时间戳进签名串是防重放的核心：只签 body 的报文被抓包后可以原样重发到天荒地老，
 * 而这条口子能推进签收、触发结算解冻。
 *
 * <p>比对用 {@link MessageDigest#isEqual}，恒定时间——验签处一个可测的短路比较
 * 就是给攻击者一个"逐字节猜签名"的口子。
 */
public final class TraceSignature {

    /** 时间戳容差。覆盖正常的时钟漂移和排队延迟，超出即视为重放。 */
    private static final Duration TIMESTAMP_TOLERANCE = Duration.ofMinutes(5);

    private TraceSignature() {}

    /** 验签。密钥没配（空串）永远 false——fail closed，不存在的锁不该有万能钥匙。 */
    public static boolean verify(String secret, String rawBody, String timestampMillis, String signatureHex) {
        if (secret == null || secret.isBlank() || signatureHex == null || signatureHex.isBlank()) {
            return false;
        }
        if (!fresh(timestampMillis)) {
            return false;
        }
        byte[] expected = hmac(secret, rawBody + "\n" + timestampMillis);
        byte[] given;
        try {
            given = HexFormat.of().parseHex(signatureHex.trim());
        } catch (IllegalArgumentException e) {
            return false;
        }
        return MessageDigest.isEqual(expected, given);
    }

    /** 时间戳必须是可解析的毫秒数，且落在当前时刻的容差窗内。 */
    private static boolean fresh(String timestampMillis) {
        if (timestampMillis == null || timestampMillis.isBlank()) {
            return false;
        }
        long millis;
        try {
            millis = Long.parseLong(timestampMillis.trim());
        } catch (NumberFormatException e) {
            return false;
        }
        return Math.abs(System.currentTimeMillis() - millis) <= TIMESTAMP_TOLERANCE.toMillis();
    }

    private static byte[] hmac(String secret, String rawBody) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(rawBody.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC 计算失败", e);
        }
    }
}
