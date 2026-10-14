/**
 * validation-rules —— 422 字段级明细里 `errors[].rule` 的全部取值，前端侧唯一的定义处。
 *
 * 后端权威是 `com.shop.platform.common.ValidationRules`（那条通道把 jakarta 约束翻成
 * 「哪个字段违反了哪条规则、边界是多少」，规则名的出口只有那里）。这里是**同一份词表的镜像**，
 * 不是「差不多的一组」：两边相等由 `apps/server` 的 `ValidationRuleVocabularyTest` 读本文件的键核对，
 * 与错误码那三边等式（`ErrorCodeVocabularyTest`）同一个套路。
 *
 * 存在的理由是取文案：`fieldErrorFact` 按 rule 产出**可本地化的事实**（key + params），句子在渲染边界按当前语言出，而不是显示后端注解上那句中文
 * `message`。改一条规则的边界（后端注解上的数字）时前端零改动；要改**措辞**才动 catalog。
 *
 * 粒度刻意是「可复用的规则」而不是「一字段一码」：字段名由 `errors[].field` 出，规则名由这里出，
 * 前端把两者与 catalog 里的句子拼起来即可。所以这个词表小到能被人读完。
 */

/** 规则名 → catalog 句子的键（`validation.<RULE>`，在 app-kit 的 locales 里，两份语言各一条） */
export const VALIDATION_RULES = {
    /** 值缺失（@NotNull / @NotBlank / @NotEmpty） */
    REQUIRED: "validation.REQUIRED",
    /** 长度不足（@Size(min=…)），带 min */
    MIN_LENGTH: "validation.MIN_LENGTH",
    /** 长度超限（@Size(max=…)），带 max */
    MAX_LENGTH: "validation.MAX_LENGTH",
    /** 格式不符（@Pattern）——正则本身不出现在响应里，前端也不需要它 */
    PATTERN: "validation.PATTERN",
    /** 数值小于下限（@Min / @DecimalMin），带 min */
    MIN: "validation.MIN",
    /** 数值大于上限（@Max / @DecimalMax），带 max */
    MAX: "validation.MAX",
} as const

export type ValidationRule = keyof typeof VALIDATION_RULES

/** 词表里有没有这条规则（wire 上可能出现后端加了而这里还没跟上的值，此时退回 message） */
export const isValidationRule = (rule: string | undefined): rule is ValidationRule =>
    rule !== undefined && Object.hasOwn(VALIDATION_RULES, rule)
