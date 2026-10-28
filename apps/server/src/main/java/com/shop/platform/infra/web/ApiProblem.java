package com.shop.platform.infra.web;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Map;

/**
 * 错误响应形状（RFC 9457 {@code ProblemDetail} + 我们的四个扩展属性）的契约声明。
 *
 * <p><b>为什么要有这个类。</b>{@link GlobalExceptionHandler} 返回的是 Spring 的 {@code ProblemDetail}，
 * 而 springdoc 不会为它生成 schema——于是重写期重导出契约时，{@code components.schemas} 里
 * 既没有 {@code ApiProblem} 也没有 {@code ApiFieldError}，前端的
 * {@code packages/client/src/sdk-client.ts} 一 import {@code zApiProblem} 就断链。
 *
 * <p>它的唯一用途是<b>被 springdoc 扫进契约</b>（由 {@link ApiProblemSchemaConfig} 显式注册），
 * 没有运行时行为、不被任何控制器引用。形状与 {@link GlobalExceptionHandler} 实际写出去的 JSON
 * 一一对应：改那边必须改这里，否则前端按契约校验错误体时会静默退回「宽松兜底」——
 * 那是最难发现的一类漂移，因为请求照常失败、只是错误码和字段级明细丢了。
 *
 * <p>可选性照实标：{@code code} 只在「前端无法仅凭 status 区分」时才出现，{@code errors} /
 * {@code params} 同理。{@code status} / {@code detail} / {@code requestId} 三格恒有
 * （{@code requestId} 由 {@link RequestIdFilter} 保证永远非空——空 requestId 等于这个错误没法追）。
 */
@Schema(name = "ApiProblem", description = "错误响应（RFC 9457 ProblemDetail + code/errors/params/requestId）")
public record ApiProblem(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String detail,
        String title,
        String type,
        String instance,
        String code,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String requestId,
        /**
         * 结构化上下文：只收标量三态（字符串 / 数字 / 布尔）。
         *
         * <p>{@code additionalProperties} 的联合类型由 {@link ApiProblemSchemaConfig} 补上——
         * 注解表达不了「值可以是三种标量之一」，而用 {@code Object} 会被生成成
         * {@code Record<string, unknown>}，前端每次取值都得自己判类型。
         */
        Map<String, Object> params,
        List<ApiFieldError> errors) {

    /**
     * 422 那一发的字段级明细，用来把错误定位到具体输入框。
     *
     * <p>与 {@code FieldValidationErrors} 实际写出去的键逐格对应：{@code field} / {@code message}
     * 恒有，其余按违反的规则按需出现。{@code min}/{@code max} 用 {@link Number}：
     * {@code @Min} 给 Long、{@code @DecimalMin} 给 BigDecimal，两者序列化后都是 JSON 数字。
     *
     * @param rule 违反了哪条规则（{@code NotBlank} / {@code Size} / {@code Pattern} …），
     *     前端按它选本地化句子——{@code message} 是后端那句成品中文，只进日志，不进界面
     * @param min / max 边界值，从注解读，不是从被拒的值反推
     * @param value 规则实际作用到的数据（命中的违禁词等）：service 层手动校验时补，
     *     有它才能参数化句子，不用从中文 detail 里正则捞
     */
    @Schema(name = "ApiFieldError")
    public record ApiFieldError(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String field,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String message,
            String rule,
            Number min,
            Number max,
            String value) {}
}
