package com.shop.platform.payment.internal;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.PrivateKey;
import java.security.Signature;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/**
 * 支付宝请求签名。**只用 JDK**，不引 SDK。
 *
 * <p>为什么单独一个类：私钥只在这一个地方被用到。把私钥塞进 {@link AlipayChannel} 会让那个类同时管
 * "怎么调渠道"和"凭证在哪"，而凭证该由配置层给，不该在业务流程里出现。
 *
 * <p>签名串规则和验签完全对称：非空参数按 key 字典序拼 {@code k=v&k=v}，去掉 {@code sign} 和 {@code sign_type}。
 * 用同一个 {@link #canonical} 是刻意的——两边各写一份，迟早会差一个空格。
 */
public class AlipayRequestSigner {

    private final PrivateKey appPrivateKey;

    public AlipayRequestSigner(PrivateKey appPrivateKey) {
        this.appPrivateKey = Objects.requireNonNull(appPrivateKey, "appPrivateKey");
    }

    /**
     * 给参数表签名，返回 Base64 签名值。
     *
     * <p>调用方负责把返回值放进 {@code sign} 参数再发出去。
     */
    public String sign(Map<String, String> params) {
        String content = AlipayChannel.canonical(params);
        try {
            Signature signer = Signature.getInstance("SHA256withRSA");
            signer.initSign(appPrivateKey);
            signer.update(content.getBytes(StandardCharsets.UTF_8));
            return java.util.Base64.getEncoder().encodeToString(signer.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("支付宝请求签名失败", e);
        }
    }

    /**
     * 产出可直接提交的表单参数：签名并回填 {@code sign}。
     *
     * <p>返回新 Map 而不是改入参：把入参改掉，调用方那个"还没签名"的版本就没了，重试时无从对比。
     */
    public Map<String, String> signParams(Map<String, String> params) {
        Map<String, String> signed = new TreeMap<>(params);
        signed.put("sign", sign(signed));
        return signed;
    }
}
