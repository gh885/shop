package com.shop.platform.infra.web;

import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.BooleanSchema;
import io.swagger.v3.oas.models.media.ComposedSchema;
import io.swagger.v3.oas.models.media.NumberSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import java.util.List;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 把错误响应形状塞进 {@code /v3/api-docs}。
 *
 * <p>springdoc 只扫「从 controller 走得到」的类型，{@link ApiProblem} 没有任何控制器引用它
 * （它是 {@link GlobalExceptionHandler} 的返回形状，而那是个 {@code @RestControllerAdvice}），
 * 所以光声明 record 是看不见的——必须显式注册。
 *
 * <p><b>为什么不能省这一步。</b>前端的 SDK 传输层用生成的 {@code zApiProblem} 整份校验错误体，
 * 契约里没有这个 schema 就等于那条校验永远走不到成功分支：每个错误响应都被当成「形状漂移」，
 * 报一条 drift 之后退回逐格宽松解读。请求照常失败、但错误码和字段级明细会静默丢一半。
 *
 * <p>顺带补 {@code ApiProblem.params} 的值类型。注解表达不了「值是三种标量之一」：
 * 声明成 {@code Map<String, Object>} 会被生成成 {@code Record<string, unknown>}，
 * 前端 {@code ApiParamsSchema} 那条 {@code z.union([string, number, boolean])} 就对不上。
 * 这里把 {@code additionalProperties} 换成显式联合，与后端 {@code BusinessException#getParams}
 * 只收标量三态的事实对齐。
 */
@Configuration(proxyBeanMethods = false)
class ApiProblemSchemaConfig {

    @Bean
    OpenApiCustomizer apiProblemSchemaCustomizer() {
        return (OpenAPI openApi) -> {
            Components components = openApi.getComponents() == null ? new Components() : openApi.getComponents();
            ModelConverters.getInstance().readAll(ApiProblem.class).forEach(components::addSchemas);
            narrowParamsToScalars(components);
            openApi.setComponents(components);
        };
    }

    /** {@code params: {[key]: string | number | boolean}} */
    private static void narrowParamsToScalars(Components components) {
        Schema<?> problem = components.getSchemas().get("ApiProblem");
        if (problem == null || problem.getProperties() == null) {
            return;
        }
        Object raw = problem.getProperties().get("params");
        if (!(raw instanceof Schema<?> params)) {
            return;
        }
        // 用具体的 Schema 子类而不是 new Schema<>().type(...)：后者的 type 在序列化时会被丢掉，
        // 生成出三个空对象 `anyOf: [{}, {}, {}]`——那等于没约束，前端 z.record(z.unknown()) 又会漏判类型
        Schema<Object> scalar =
                new ComposedSchema().anyOf(List.of(new StringSchema(), new NumberSchema(), new BooleanSchema()));
        params.setAdditionalProperties(scalar);
    }
}
