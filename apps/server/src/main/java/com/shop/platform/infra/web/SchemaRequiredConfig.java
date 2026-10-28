package com.shop.platform.infra.web;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.Schema;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 把「响应字段的键一定存在」写进契约。
 *
 * <p><b>为什么需要它。</b>springdoc 只为带校验注解（{@code @NotNull} / {@code @NotBlank} …）的字段生成
 * {@code required}。我们的响应 record 是读模型，字段上不挂校验注解——于是生成的 TS 里每个字段都是
 * {@code xxx?: T | undefined}，前端每次取值都得先证明非空，把「这个 record 的构造器已经保证了」
 * 在消费侧重证一遍。{@code Money} 曾单独补过 {@code requiredMode}，同类字段有 95 个 schema 之多，
 * 逐字段补注解既啰嗦又必然漏。
 *
 * <p><b>只标 required，不标 nullable。</b>后端没有 {@code @Nullable} 约定，把所有引用字段都标成
 * {@code T | null} 会让前端处处判空——那是把「可能出现 null」当默认，比 {@code ?} 更糟。
 * 真正的可空字段（如驳回理由）在消费侧按语义判空即可。
 *
 * <p><b>请求体排除在外。</b>入参 DTO 一律以 {@code *Request} 命名（仓里 47 个，无一例外），
 * 它们的字段是「可选/必填」的业务语义，由 {@code @NotNull} 一类注解逐字段声明——统一标 required
 * 会让可选入参在类型层变成必填，把「不传就是不改」的语义抹掉。
 */
@Configuration(proxyBeanMethods = false)
class SchemaRequiredConfig {

    private static final String REQUEST_SUFFIX = "Request";

    /**
     * 错误响应不在此列：{@code code} / {@code params} / {@code errors} 只在特定错误下出现，
     * 「键不一定在」正是它的语义——标成全必填会让前端每次判错都以为形状漂移。
     */
    private static final Set<String> SKIPPED = Set.of("ApiProblem", "ApiFieldError");

    @Bean
    OpenApiCustomizer requiredPropertiesCustomizer() {
        return (OpenAPI openApi) -> {
            Components components = openApi.getComponents();
            if (components == null || components.getSchemas() == null) {
                return;
            }
            for (Map.Entry<String, Schema> entry : components.getSchemas().entrySet()) {
                if (entry.getKey().endsWith(REQUEST_SUFFIX) || SKIPPED.contains(entry.getKey())) {
                    continue;
                }
                markAllRequired(entry.getValue());
            }
        };
    }

    private static void markAllRequired(Schema<?> schema) {
        if (schema == null
                || schema.getProperties() == null
                || schema.getProperties().isEmpty()) {
            return;
        }
        List<String> names = new ArrayList<>(schema.getProperties().keySet());
        schema.setRequired(names);
    }
}
