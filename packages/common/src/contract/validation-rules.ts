/** validation-rules —— 422 字段级明细 `errors[].rule` 的全部取值，前端侧唯一定义处；后端权威 `com.shop.platform.common.ValidationRules` 的镜像（两边相等由 `ValidationRuleVocabularyTest` 核）。取文案口径见「错误码判据」。 */

export const VALIDATION_RULES = {
    REQUIRED: "validation.REQUIRED",
    MIN_LENGTH: "validation.MIN_LENGTH",
    MAX_LENGTH: "validation.MAX_LENGTH",
    PATTERN: "validation.PATTERN",
    MIN: "validation.MIN",
    MAX: "validation.MAX",
} as const

export type ValidationRule = keyof typeof VALIDATION_RULES

/** wire 上可能出现后端加了而这里没跟上的值，此时退回 message */
export const isValidationRule = (rule: string | undefined): rule is ValidationRule =>
    rule !== undefined && Object.hasOwn(VALIDATION_RULES, rule)
