package com.shop.platform.common;

/**
 * 字段级校验规则的常量：422 响应里 {@code errors[].rule} 的全部取值，全后端唯一的定义处。
 *
 * <p>为什么要有这张表：422 的字段级明细过去只带一句**成品中文**（{@code errors[].message}），
 * 前端要本地化它就只能显示中文或自己猜规则。现在多带一个 {@code rule}——「这个字段违反了哪条规则、
 * 边界是多少」，具体句子由前端 catalog 按自己的语言出。后端不再负责「那句话怎么说」。
 *
 * <p>粒度刻意停在「可复用的规则」而不是「一字段一码」：不建
 * {@code ORDER_ITEM_QUANTITY_TOO_SMALL} 这种词表——字段名由 {@code errors[].field} 出（机器字段名），
 * 规则名由这里出，两者在前端拼成句子即可，词表小到能被人读完。
 *
 * <p>边界值（{@code max} / {@code min}）与 rule 一起出，且**只在这一处**产生：它们由
 * {@link infra.web.FieldValidationErrors} 从 DTO 上的注解读出来，随 rule 一起进响应。
 * 前端那一份同值镜像在 {@code packages/common/src/contract/validation-rules.ts}，两边相等由
 * {@code ValidationRuleVocabularyTest} 核对（无库、不起 Spring）。
 *
 * <p>与 {@link ErrorCodes} 一样是 ProblemDetail 扩展属性：形状进契约
 * （{@code ApiProblem.errors[].rule} 声明成普通 {@code string}），取值不进——契约里没有规则名的
 * enum，所以增删一条规则不需要 {@code pnpm sdk:gen}。见 {@code 错误码判据} §错误响应契约。
 */
public final class ValidationRules {

    private ValidationRules() {}

    /** 值缺失（{@code @NotNull} / {@code @NotBlank} / {@code @NotEmpty}） */
    public static final String REQUIRED = "REQUIRED";

    /** 长度不足（{@code @Size(min=…)}），带 {@code min} */
    public static final String MIN_LENGTH = "MIN_LENGTH";

    /** 长度超限（{@code @Size(max=…)}），带 {@code max} */
    public static final String MAX_LENGTH = "MAX_LENGTH";

    /** 格式不符（{@code @Pattern}）——正则本身不出现在响应里：那是内部实现，前端也不需要它 */
    public static final String PATTERN = "PATTERN";

    /** 数值小于下限（{@code @Min} / {@code @DecimalMin}），带 {@code min} */
    public static final String MIN = "MIN";

    /** 数值大于上限（{@code @Max} / {@code @DecimalMax}），带 {@code max} */
    public static final String MAX = "MAX";
}
