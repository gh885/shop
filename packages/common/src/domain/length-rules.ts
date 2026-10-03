import { VALIDATION_RULES } from "../contract/validation-rules"
import { z } from "zod"

/**
 * 一条校验事实：`message` 是 catalog key，`params` 是要插进句子里的数据（`docs/conventions/i18n.md` §6.1）。
 * 句子由渲染边界按当前语言换出来，schema 因此与 locale 无关。
 */
export interface FieldRuleIssue {
    message: string
    params?: Record<string, string | number>
}

/**
 * 带数字的长度条款：**判据（那个数）与槽位（句子里的 `{max}`）同一个来源**。
 *
 * 为什么不是 `.min(N, …)` / `.max(N, …)` 那两条 check：实测（Zod 4.6）它们会把多给的 `params`
 * **丢掉**——issue 里只剩 `message` 与 `maximum`/`minimum`，而渲染层的翻译器只读 `message` 与 `params`。
 * 于是「最长 {max} 个字」的槽位填不上，`formatMessage` 拿不到参数就原样给回模板，用户看见裸的 `{max}`。
 * `refine` 那条通道会原样带上 `params`，所以带数字的长度上下限一律走这里，
 * 而不是各处 `.max(N)` 再补一句注释提醒「别忘了数字传不出去」。
 *
 * 默认句子复用 `validation.{MIN,MAX}_LENGTH`：422 那条通道（`field-error-fact.ts` 按 rule 出事实）
 * 用的就是这两个 key 与同一个槽位名，本地校验再建一份「最多 N 字」就是同一个概念两个出口。
 * 传 `issue` 只换句子、不换槽位——`params` 恒由这里给，调用方塞不进去第二个键。
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
