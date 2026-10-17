import { VALIDATION_RULES } from "../contract/validation-rules"
import { z } from "zod"

/** `message` 是 catalog key，`params` 是插进句子的数据；句子在渲染边界按语言换出，schema 与 locale 无关。 */
export interface FieldRuleIssue {
    message: string
    params?: Record<string, string | number>
}

/** 带数字的长度条款：判据（那个数）与槽位（句子里的 `{max}`）同源。上限走 `refine` 不走 `.max(N,…)`，因为 Zod 4.6 会从 `.min/.max` 丢掉 `params`（issue 只剩 message 与 maximum/minimum），渲染层拿不到参数就把裸 `{max}` 印给用户；`refine` 会原样带上 `params`。 */

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
