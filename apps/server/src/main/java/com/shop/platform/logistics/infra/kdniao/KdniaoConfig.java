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
 * <p>RestClient 在这里新建而不是注入共享 Bean：它是本适配器私有的出站通道（超时、重试策略都该随它走），
 * 复用全局客户端会让"给物流调超时"变成"给全站调超时"。
 */
@Configuration(proxyBeanMethods = false)
public class KdniaoConfig {

    @Bean
    CarrierTrackingGateway carrierTrackingGateway(KdniaoProperties props, ObjectMapper objectMapper) {
        RestClient restClient = RestClient.builder()
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
