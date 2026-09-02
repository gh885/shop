package com.shop.platform.infra.web;

import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI 契约装配。
 *
 * <p>唯一职责：把自定义形参注解登记进 springdoc 的忽略表。{@code @CurrentUser UUID userId} 在
 * springdoc 眼里是个「没有任何 Spring 注解的裸 UUID 形参」，默认会被当成必填 query 参数写进
 * {@code /v3/api-docs}——契约一旦污染，{@code pnpm gen:sdk} 生成的每个受保护端点都会多出一个
 * 前端根本无法提供的 {@code userId} 入参。这不是文档瑕疵，是会编译失败的类型契约事故。
 *
 * <p>登记必须在 springdoc 扫描之前发生，故写在静态块里（{@code SpringDocUtils} 是全局单例配置）。
 */
@Configuration(proxyBeanMethods = false)
public class OpenApiConfig {

    static {
        SpringDocUtils.getConfig().addAnnotationsToIgnore(CurrentUser.class, CurrentShop.class);
    }
}
