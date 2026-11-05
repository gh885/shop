package com.shop.platform.infra.web;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * {@code /v3/api-docs} 的标题与说明。不设就是 springdoc 的默认「OpenAPI definition」，
 * 文档页（{@code /api-docs.html}）页眉读的就是这里。
 */
@Configuration(proxyBeanMethods = false)
class OpenApiInfoConfig {

    @Bean
    OpenAPI shopOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Shop API")
                        .description("多店铺电商平台后端。三端共用一套接口：买家 /api/buyer、卖家 /api/seller、平台 /api/admin。")
                        .version("dev"));
    }
}
