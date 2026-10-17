package com.shop.platform.payment.infra.alipay;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Map;
import java.util.TreeMap;

/**
 * 支付宝 RSA2 签名与验签。
 *
 * <p>规则来自对方协议，不是我们的选择：待签名串 = 除 {@code sign} 外的非空参数按参数名 ASCII 升序、
 * {@code key=value} 用 {@code &} 连接（值是 URL 解码后的原始值，不是编码后的），
 * 用应用私钥 {@code SHA256withRSA} 签名再 Base64。
 *
 * <p>验签方向相反：用支付宝公钥验证响应里 {@code xxx_response} 节点的<b>原始 JSON 文本</b>——
 * 重新序列化会因字段顺序/空格差异导致验签失败，这是对接支付宝最常见的坑。
 * 响应必须验签：不验签就等于相信任何能访问回调地址的人推来的「支付成功」。
 */
public final class AlipaySign {

    private AlipaySign() {}

    /** 生成请求签名：返回 Base64 签名串 */
    public static String sign(Map<String, String> params, String base64PrivateKey) {
        try {
            PrivateKey key = KeyFactory.getInstance("RSA").generatePrivate(pkcs8(base64PrivateKey));
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(key);
            signature.update(contentOf(params).getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signature.sign());
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("支付宝请求签名失败：检查应用私钥格式（PKCS#8 Base64，不含 PEM 头尾）", e);
        }
    }

    /** 校验响应 / 回调签名：content 是对方签名的原文，不能重新序列化 */
    public static boolean verify(String content, String base64Sign, String base64PublicKey) {
        if (content == null
                || content.isEmpty()
                || base64Sign == null
                || base64Sign.isBlank()
                || base64PublicKey == null
                || base64PublicKey.isBlank()) {
            return false;
        }
        try {
            PublicKey key = KeyFactory.getInstance("RSA").generatePublic(x509(base64PublicKey));
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initVerify(key);
            signature.update(content.getBytes(StandardCharsets.UTF_8));
            return signature.verify(Base64.getDecoder().decode(base64Sign.trim()));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            return false;
        }
    }

    /** 待签名串：按参数名升序，排除空值与 sign 本身 */
    public static String contentOf(Map<String, String> params) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : new TreeMap<>(params).entrySet()) {
            if ("sign".equals(entry.getKey())
                    || entry.getValue() == null
                    || entry.getValue().isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append('&');
            }
            sb.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return sb.toString();
    }

    private static PKCS8EncodedKeySpec pkcs8(String base64) {
        return new PKCS8EncodedKeySpec(Base64.getDecoder().decode(compact(base64)));
    }

    private static X509EncodedKeySpec x509(String base64) {
        return new X509EncodedKeySpec(Base64.getDecoder().decode(compact(base64)));
    }

    /** 去掉密钥里的空白与换行：Base64 解码器不接受空白，而环境变量里常有意外折行 */
    private static String compact(String key) {
        return key.replaceAll("\\s", "");
    }
}
