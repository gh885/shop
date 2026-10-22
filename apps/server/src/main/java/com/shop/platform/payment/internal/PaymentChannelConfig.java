package com.shop.platform.payment.internal;

import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 渠道装配。**唯一的渠道选择点。**
 *
 * <p>两条设计：
 *
 * <ul>
 *   <li>默认 {@code mock}：本地不配任何密钥也能把"下单 → 支付 → 发货"跑通
 *   <li>选了真渠道就必须配齐密钥，配不齐**启动直接失败**——不让"以为接了支付宝其实没接"这种状态存在
 * </ul>
 *
 * <p>密钥只从环境变量来（{@code apps/server/.env} 或部署平台），不落代码。公钥进日志没关系，私钥永远不进。
 */
@Configuration
public class PaymentChannelConfig {

    private static final Logger log = LoggerFactory.getLogger(PaymentChannelConfig.class);

    @Bean
    PaymentChannel paymentChannel(
            @Value("${shop.payment.channel:mock}") String channel,
            @Value("${shop.payment.alipay.app-id:}") String appId,
            @Value("${shop.payment.alipay.public-key:}") String publicKey,
            @Value("${shop.payment.alipay.gateway-url:}") String gatewayUrl,
            @Value("${shop.payment.alipay.notify-url:}") String notifyUrl,
            @Value("${shop.payment.alipay.return-url:}") String returnUrl) {

        if ("mock".equalsIgnoreCase(channel)) {
            log.info("支付渠道：mock（本地调试用，不会真的收到钱）");
            return new MockChannel();
        }

        if (!"alipay".equalsIgnoreCase(channel)) {
            throw new IllegalStateException("未知支付渠道: " + channel + "，可选 mock / alipay");
        }

        // 选了支付宝就三样都得有：没有 appId 拿不到单，没有公钥验不了签，没有网关发不了请求
        if (appId.isBlank() || publicKey.isBlank() || gatewayUrl.isBlank()) {
            throw new IllegalStateException("支付渠道选了 alipay，但 SHOP_PAYMENT_ALIPAY_APP_ID / PUBLIC_KEY / GATEWAY_URL 没配齐。"
                    + "本地想跳过支付协议就把 channel 设成 mock");
        }

        log.info("支付渠道：alipay，网关 {}", gatewayUrl);
        return new AlipayChannel(
                appId, parsePublicKey(publicKey), gatewayUrl, notifyUrl, returnUrl, defaultTransport());
    }

    /**
     * 解析渠道公钥。支付宝控制台给的是不带头尾的裸 Base64，这里补上 X.509 头。
     *
     * <p>允许调用方传带头的完整 PEM：两种都有人贴，认不出就报错，不要猜。
     */
    private static PublicKey parsePublicKey(String raw) {
        String base64 = raw.replaceAll("-----(BEGIN|END) PUBLIC KEY-----", "").replaceAll("\\s", "");
        try {
            byte[] der = Base64.getDecoder().decode(base64);
            return KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("支付渠道公钥解析失败，检查格式是否为 RSA 公钥", e);
        }
    }

    /**
     * 默认传输：JDK 自带的 {@code HttpClient}。
     *
     * <p>不用 SDK 也就没有它的重试和连接池；这里只设超时。支付请求不能无脑重试——
     * 超时重发可能造成两笔支付单，那是钱的问题。
     */
    private static AlipayChannel.HttpTransport defaultTransport() {
        java.net.http.HttpClient client = java.net.http.HttpClient.newBuilder()
                .connectTimeout(java.time.Duration.ofSeconds(5))
                .build();

        return (url, form) -> {
            String body = form.entrySet().stream()
                    .map(entry -> java.net.URLEncoder.encode(entry.getKey(), java.nio.charset.StandardCharsets.UTF_8)
                            + "="
                            + java.net.URLEncoder.encode(entry.getValue(), java.nio.charset.StandardCharsets.UTF_8))
                    .reduce((left, right) -> left + "&" + right)
                    .orElse("");
            try {
                java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                        .uri(java.net.URI.create(url))
                        .timeout(java.time.Duration.ofSeconds(10))
                        .header("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
                        .POST(java.net.http.HttpRequest.BodyPublishers.ofString(body))
                        .build();
                java.net.http.HttpResponse<String> response =
                        client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
                return response.body();
            } catch (java.io.IOException e) {
                throw new IllegalStateException("调用支付渠道失败: " + url, e);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("调用支付渠道被中断", e);
            }
        };
    }
}
