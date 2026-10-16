import { VALIDATION_RULES } from "../contract/validation-rules"
import { z } from "zod"

/**
 * 一条校验事实：`message` 是 catalog key，`params` 是要插进句子里的数据。
 * 句子由渲染边界按当前语言换出来，schema 因此与 locale 无关。
 */
export interface FieldRuleIssue {
    message: string
    params?: Record<string, string | number>
}

/**
 * 带数字的长度条款：**判据（那个数）与槽位（句子里的 `{max}`）同一个来源**。用 `.min(N,…)`/`.max(N,…)` 会被 Zod 4.6 **丢掉多给的 `params`**（issue 里只剩 message 与 maximum/minimum），渲染层拿不到参数就把裸 `{max}` 印给用户；`refine` 那条通道会原样带上 `params`，所以上下限一律走这里。默认句子复用 `validation.{MIN,MAX}_LENGTH`（422 通道 `field-error-fact.ts` 用的是同一 key 同一槽位，不再另建一份）；传 `issue` 只换句子、不换槽位——`params` 恒由这里给。
 */

/** 长度上限：`value.length <= max`，句子带 `{max}` */
export function withMaxLength<S extends z.ZodType<string>>(
    schema: S,
    max: number,
    issue?: FieldRuleIssue,
): S {
    return schema.refine((value) => value.length <= max, {
        ...(issue ?? { message: VALIDATION_RULES.MAX_LENGTH }),
        params: { max },
    })
}

/** 长度下限：`value.length >= min`，句子带 `{min}`（口令档位这类「至少 N 位」用它） */
export function withMinLength<S extends z.ZodType<string>>(
    schema: S,
    min: number,
    issue?: FieldRuleIssue,
): S {
    return schema.refine((value) => value.length >= min, {
        ...(issue ?? { message: VALIDATION_RULES.MIN_LENGTH }),
        params: { min },
    })
}
