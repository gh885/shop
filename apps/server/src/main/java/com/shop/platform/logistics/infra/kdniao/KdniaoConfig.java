package com.shop.platform.logistics.infra.kdniao;

import com.shop.platform.logistics.service.CarrierTrackingGateway;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

/**
 * 承运商网关装配。未配置密钥时网关照常创建（应用不因缺密钥启动失败），
 * 只是 {@code available()} 为 false，轮询任务与 webhook 都不工作——与七牛同一条思路。
 *
 * <p>RestClient 从 Boot 注入的 Builder 构建：这样自动带上 {@code http.client.requests}
 * 观测；超时是本适配器的私有策略，不碰全局客户端，避免"给物流调超时"变成"给全站调超时"。
 */
@Configuration(proxyBeanMethods = false)
public class KdniaoConfig {

    @Bean
    CarrierTrackingGateway carrierTrackingGateway(
            KdniaoProperties props, ObjectMapper objectMapper, RestClient.Builder restClientBuilder) {
        RestClient restClient = restClientBuilder
                .requestFactory(new org.springframework.http.client.SimpleClientHttpRequestFactory() {
                    {
                        setConnectTimeout(3_000);
                        setReadTimeout(5_000);
                    }
                })
                .build();
        return new KdniaoTrackingGateway(props, restClient, objectMapper);
    }
}
