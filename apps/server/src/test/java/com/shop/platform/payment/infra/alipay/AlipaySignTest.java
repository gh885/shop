package com.shop.platform.payment.infra.alipay;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * 支付宝签名 / 验签单测。
 *
 * <p>这层出错的两个方向都很贵：签错 → 沙箱直接拒（可发现）；验错 → 把伪造的「支付成功」当真（不可发现）。
 * 所以除了往返成功，还要钉住三件事：待签名串的排序与空值排除、签名被篡改必须失败、
 * 用错公钥必须失败（公私钥配对是接沙箱最常见的翻车点）。
 */
class AlipaySignTest {

    private static KeyPair keyPair;

    private static String privateKey;

    private static String publicKey;

    @BeforeAll
    static void generateKeyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        keyPair = generator.generateKeyPair();
        privateKey = Base64.getEncoder().encodeToString(keyPair.getPrivate().getEncoded());
        publicKey = Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());
    }

    @Test
    void 待签名串_按参数名升序_排除空值与sign自身() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("biz_content", "{\"a\":1}");
        params.put("app_id", "90210001");
        params.put("sign", "SHOULD_NOT_APPEAR");
        params.put("empty", "");

        assertThat(AlipaySign.contentOf(params)).isEqualTo("app_id=90210001&biz_content={\"a\":1}");
    }

    @Test
    void 签名验签往返成功() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("app_id", "90210001");
        params.put("method", "alipay.trade.query");
        params.put("biz_content", "{\"out_trade_no\":\"abc\"}");

        String sign = AlipaySign.sign(params, privateKey);

        assertThat(AlipaySign.verify(AlipaySign.contentOf(params), sign, publicKey))
                .isTrue();
    }

    @Test
    void 报文被篡改_验签失败() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("app_id", "90210001");
        params.put("amount", "1.00");
        String sign = AlipaySign.sign(params, privateKey);

        assertThat(AlipaySign.verify("amount=9999.00&app_id=90210001", sign, publicKey))
                .isFalse();
    }

    @Test
    void 公钥不匹配_验签失败() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        String strangerPublicKey = Base64.getEncoder()
                .encodeToString(generator.generateKeyPair().getPublic().getEncoded());

        String sign = AlipaySign.sign(Map.of("app_id", "90210001"), privateKey);

        assertThat(AlipaySign.verify("app_id=90210001", sign, strangerPublicKey))
                .isFalse();
    }

    @Test
    void 带换行的密钥也能解析() {
        String wrapped = privateKey.substring(0, 40) + "\n" + privateKey.substring(40);

        String sign = AlipaySign.sign(Map.of("app_id", "90210001"), wrapped);

        assertThat(AlipaySign.verify("app_id=90210001", sign, publicKey)).isTrue();
    }

    @Test
    void 空签名或空公钥一律拒绝() {
        assertThat(AlipaySign.verify("x=1", null, publicKey)).isFalse();
        assertThat(AlipaySign.verify("x=1", "abc", "")).isFalse();
        assertThat(AlipaySign.verify(null, "abc", publicKey)).isFalse();
    }

    @Test
    void 与JDK原生签名算法一致() throws Exception {
        String content = "app_id=90210001&method=alipay.trade.query";
        Signature jdk = Signature.getInstance("SHA256withRSA");
        jdk.initSign(keyPair.getPrivate());
        jdk.update(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String expected = Base64.getEncoder().encodeToString(jdk.sign());

        assertThat(AlipaySign.sign(Map.of("app_id", "90210001", "method", "alipay.trade.query"), privateKey))
                .isEqualTo(expected);
    }
}
