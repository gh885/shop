package com.shop.platform.infra.web;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.JsonSchema;
import io.swagger.v3.oas.models.media.Schema;
import java.util.List;
import java.util.Set;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 修 springdoc 输出的「nullable $ref」形状：`{"type": "null", "$ref": "#/..."}`
 * 不是合法的 OpenAPI 3.1——JSON Schema 里 `type` 与 `$ref` 不能这样并排（3.1 起两者都是
 * schema 关键字，`type: "null"` 会把值直接判成 null，$ref 又指向对象，互斥）。springdoc 3.1.0
 * 对「{@code @Schema(nullable = true)} 打在对象引用上」就吐这个形状（字符串引用没事，
 * 它会展开成 {@code type: ["string", "null"]}）。
 *
 * <p><b>为什么不能放着不管。</b>前端的 SDK（openapi-ts）按 schema 生成 zod 校验器，这个形状
 * 里的 null 信息会被静默丢掉：字段生成成非空引用，服务端真的回 null 时（如
 * {@code BuyerProductCard.minPrice} 暂无报价、{@code CategoryAttributeView.visibleWhen} 无规则）
 * 每次响应都判「契约漂移」。重写成 3.1 的标准写法
 * {@code anyOf: [{$ref}, {type: "null"}]}，生成的 zod 就是 {@code .nullable()}。
 *
 * <p>只走一遍 components.schemas 的顶层属性：目前项目里可空引用都住在 record 顶层字段上；
 * 嵌套进 items / anyOf 的场景出现了再扩展。
 */
@Configuration(proxyBeanMethods = false)
class OpenApiNullableRefConfig {

    private static final String TYPE_NULL = "null";

    @Bean
    OpenApiCustomizer nullableRefCustomizer() {
        return (OpenAPI openApi) -> {
            Components components = openApi.getComponents();
            if (components == null || components.getSchemas() == null) {
                return;
            }
            components.getSchemas().values().stream()
                    .filter(schema -> schema.getProperties() != null)
                    .forEach(schema ->
                            schema.getProperties().values().forEach(OpenApiNullableRefConfig::rewriteNullableRef));
        };
    }

    private static void rewriteNullableRef(Object property) {
        if (!(property instanceof Schema<?> schema)) {
            return;
        }
        String ref = schema.get$ref();
        if (ref == null) {
            return;
        }
        // springdoc 3.x 用 JsonSchema（type 是 Set<String>），旧 Schema 是 String——两种都要认
        boolean nullable =
                schema.getTypes() != null ? schema.getTypes().contains(TYPE_NULL) : TYPE_NULL.equals(schema.getType());
        if (!nullable) {
            return;
        }
        String description = schema.getDescription();
        schema.set$ref(null);
        schema.setType(null);
        if (schema.getTypes() != null) {
            schema.setTypes(null);
        }
        JsonSchema nullSchema = new JsonSchema();
        nullSchema.setTypes(Set.of(TYPE_NULL));
        schema.setAnyOf(List.of(new Schema<>().$ref(ref), nullSchema));
        schema.setDescription(description);
    }
}
