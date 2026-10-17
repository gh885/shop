package com.shop.platform.payment.infra.alipay;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

/**
 * 支付宝网关装配，只在 {@code shop.payment.alipay.enabled=true} 时创建。
 *
 * <p>未启用时应用照常启动（默认 MOCK 渠道），与快递鸟同一条思路。
 * 但一旦 {@code shop.payment.channel=ALIPAY} 而本 bean 缺失，{@code PaymentChannels} 会在启动时直接失败——
 * 不做「悄悄回落 MOCK」，那种静默降级等于把收钱这件事变成一句谎话。
 *
 * <p>RestClient 从 Boot 注入的 Builder 构建（自动带 {@code http.client.requests} 观测）；
 * 超时是本适配器的私有策略：支付链路宁可先失败也不能把请求线程拖死。
 */
@Configuration(proxyBeanMethods = false)
public class AlipayConfig {

    @Bean
    @ConditionalOnProperty(prefix = "shop.payment.alipay", name = "enabled", havingValue = "true")
    AlipayGateway alipayGateway(
            AlipayProperties props, ObjectMapper objectMapper, RestClient.Builder restClientBuilder) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(10_000);
        RestClient restClient = restClientBuilder.requestFactory(factory).build();
        return new AlipayGateway(props, restClient, objectMapper);
    }
}
