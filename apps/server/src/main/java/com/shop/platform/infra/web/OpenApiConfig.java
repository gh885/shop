package com.shop.platform.infra.web;

import io.swagger.v3.oas.models.media.Schema;
import java.util.List;
import java.util.Set;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI 契约装配。两件事：忽略表登记 + 修正 springdoc 的可空 {@code $ref} 输出。
 *
 * <p><b>① 登记自定义形参注解进忽略表。</b>{@code @CurrentUser UUID userId} 在 springdoc 眼里是个
 * 「没有任何 Spring 注解的裸 UUID 形参」，默认会被当成必填 query 参数写进 {@code /v3/api-docs}
 * ——契约一旦污染，{@code pnpm gen:sdk} 生成的每个受保护端点都会多出一个前端根本无法提供的
 * {@code userId} 入参。这不是文档瑕疵，是会编译失败的类型契约事故。登记必须在 springdoc 扫描之前
 * 发生，故写在静态块里（{@code SpringDocUtils} 是全局单例配置）。
 *
 * <p><b>② 修 {@code @Schema(nullable = true)} 打在 {@code $ref} 类型上的畸形输出。</b>
 * 对非 {@code $ref} 类型 springdoc 输出 {@code type: ["integer","null"]}（正确）；但对 {@code Money}
 * 这类被引用成 {@code $ref} 的类型，输出的是 {@code { "type": "null", "$ref": "…" }} ——在 OpenAPI 3.1
 * 里 {@code type: "null"} 的含义是「这个值必须是 null」，把那句 {@code $ref} 直接否掉了。
 * 生成器只取 {@code $ref}，于是<b>可空字段在 SDK 里变成非空类型</b>：后端真发 null 时响应 zod 校验失败，
 * 而编译期完全看不见，前端按非空读 {@code .amount} 直接崩。
 *
 * <p>改写成 3.1 的规范写法 {@code anyOf: [{ $ref }, { type: "null" }]}。修在契约出口而不是逐字段绕，
 * 是因为它一次覆盖全部同类字段（Money / Address / SkuInfo / CartProductInfo…）；剩下的改正量在消费方，
 * 那些是逐处的、必须逐处想清楚 null 该怎么办的活。
 */
@Configuration(proxyBeanMethods = false)
public class OpenApiConfig {

    static {
        SpringDocUtils.getConfig().addAnnotationsToIgnore(CurrentUser.class, CurrentShop.class, CurrentStaff.class);
    }

    /** 契约出口的最后一道修正：把「可空 + $ref」的畸形表达统一改写掉 */
    @Bean
    OpenApiCustomizer nullableRefCustomizer() {
        return openApi -> {
            if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
                return;
            }
            openApi.getComponents().getSchemas().values().forEach(OpenApiConfig::rewriteNullableRefs);
        };
    }

    /** 深度改写：属性、items、allOf/anyOf/oneOf、additionalProperties 里的同类节点都要过一遍 */
    private static void rewriteNullableRefs(Schema<?> schema) {
        if (schema == null) {
            return;
        }
        // replaceAll 走 entrySet 的 setValue，边遍历边换值是安全的
        if (schema.getProperties() != null) {
            schema.getProperties().replaceAll((name, property) -> rewritten(property));
        }
        if (schema.getItems() != null) {
            rewriteNullableRefs(schema.getItems());
        }
        if (schema.getAdditionalProperties() instanceof Schema<?> extra) {
            rewriteNullableRefs(extra);
        }
        rewriteBranch(schema.getAllOf());
        rewriteBranch(schema.getAnyOf());
        rewriteBranch(schema.getOneOf());

        toAnyOfNullableRefInPlace(schema);
    }

    private static void rewriteBranch(List<Schema> branch) {
        if (branch != null) {
            branch.forEach(OpenApiConfig::rewriteNullableRefs);
        }
    }

    /** 子节点为就地改写，返回自身只为配合 replaceAll 的签名 */
    private static Schema<?> rewritten(Schema<?> schema) {
        rewriteNullableRefs(schema);
        return schema;
    }

    /**
     * 就地改写：保留 description / title / deprecated 等兄弟键，只把 $ref 与 type 挪进 anyOf。
     * 仅在「确实是可空 $ref」且没有既有组合器时动手，避免误伤正常 schema。
     */
    private static void toAnyOfNullableRefInPlace(Schema<?> schema) {
        String ref = schema.get$ref();
        if (ref == null || !nullable(schema)) {
            return;
        }
        if (schema.getAnyOf() != null || schema.getOneOf() != null || schema.getAllOf() != null) {
            return;
        }

        schema.set$ref(null);
        schema.setType(null);
        schema.setTypes(null);

        Schema<Object> target = new Schema<>();
        target.set$ref(ref);
        Schema<Object> nullableMarker = new Schema<>();
        // 必须走 types（单元素集合序列化成 "null"）：setType 是废弃字段，不参与序列化，
        // 写了会得到一个空的 {} 分支，生成器把它读成 unknown —— 比原来更糟
        nullableMarker.setTypes(Set.of("null"));
        schema.setAnyOf(List.of(target, nullableMarker));
    }

    private static boolean nullable(Schema<?> schema) {
        if ("null".equals(schema.getType())) {
            return true;
        }
        Set<String> types = schema.getTypes();
        return types != null && types.contains("null");
    }
}
