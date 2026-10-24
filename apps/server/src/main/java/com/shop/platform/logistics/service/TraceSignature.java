package com.shop.platform.logistics.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * 轨迹推送的 HMAC-SHA256 验签。
 *
 * <p>签名串就是原始请求体的 UTF-8 字节——不搞"按字段排序再拼串"的规范化，
 * 那种格式两边各实现一遍，编码差异（空格、百分号、中文）能让验签永远对不上。
 *
 * <p>比对用 {@link MessageDigest#isEqual}，恒定时间——验签处一个可测的短路比较
 * 就是给攻击者一个"逐字节猜签名"的口子。
 */
public final class TraceSignature {

    private TraceSignature() {}

    /** 验签。密钥没配（空串）永远 false——fail closed，不存在的锁不该有万能钥匙。 */
    public static boolean verify(String secret, String rawBody, String signatureHex) {
        if (secret == null || secret.isBlank() || signatureHex == null || signatureHex.isBlank()) {
            return false;
        }
        byte[] expected = hmac(secret, rawBody);
        byte[] given;
        try {
            given = HexFormat.of().parseHex(signatureHex.trim());
        } catch (IllegalArgumentException e) {
            return false;
        }
        return MessageDigest.isEqual(expected, given);
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
