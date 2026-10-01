import { type AppLocale, fieldErrorsOf, toApiError } from "@shop/common"

import { fieldErrorText } from "./i18n/field-error-text"

/**
 * DTO 字段名 → 表单字段名。
 *
 * <p>源（DTO 的键）不约束：**这份清单是逐表单写的**，DTO 有哪些字段不归它管。
 * 目标（表单值的键）约束到 `TForm`：拼错表单字段名在这里就红（`"receiver": reciever` 不行），
 * 而那类错的后果是「错误挂在不存在的框上」——用户看不到、开发者也排查不动。
 */
export type ServerFieldMap<TForm> = Partial<Record<string, Extract<keyof TForm, string>>>

/**
 * 后端 422 的字段级明细 → **表单字段名 → 该显示的那句话**（docs/error-codes.md 的 422 参数通道）。
 *
 * <p>这是那条通道的前端一半：此前各表单标红全部来自本地 Zod，后端说「超了 / 格式不对」时前端不知道——
 * 422 那一族实际上是**只对开发可见**的。现在后端给 `rule`（+ `min`/`max`），句子由 catalog 按界面语言出。
 *
 * <p>为什么是纯函数而不是 hook：写进表单 meta 那一步需要 `@tanstack/react-form` 的类型，而它只住在
 * `@shop/ui-web`（见 `applyServerFieldErrors`）。这一层不碰表单，所以留在 app-kit 也不必引表单库。
 *
 * <p>**给了 `map` 就以它为准**：没列出的字段（DTO 有、表单没有，比如 `isDefault`）直接跳过，
 * 不回落成同名——挂到一个不存在的框上比不显示更难排查。不给 `map` 则认为两者同名。
 *
 * @param error 任意抛出的错误（`ApiError` / SDK 归一化后的对象 / 别的异常）
 * @param locale 界面语言
 * @param map DTO 字段名 → 表单字段名；**要接入哪几个框就列哪几个**，同名字段也列出来（列出来是「我确认过它同名」）
 */
export function serverFieldErrorTexts<TForm extends Record<string, unknown>>(
    error: unknown,
    locale: AppLocale,
    map?: ServerFieldMap<TForm>,
): Record<string, string> {
    const entries = fieldErrorsOf(toApiError(error)) ?? []
    const out: Record<string, string> = {}
    for (const entry of entries) {
        if (map !== undefined && map[entry.field] === undefined) continue
        const formField = map?.[entry.field] ?? entry.field
        // 同一字段多条（长度 + 格式）时取第一条：表单一个框只显示一句。
        // 顺序由后端按注解读（先长度后格式），第一条已经够指认问题；真要两句得先定排版策略
        if (out[formField] !== undefined) continue
        // rule 认得 → 本地化句子（带边界）；认不得（词表外的约束、400 那条通道来的）→ 后端那句中文。
        // 后者是兜底不是常态：它只在「规则不在词表里」时出现，而词表由门禁两边相等钉着
        out[formField] = fieldErrorText(entry, locale) ?? entry.message
    }
    return out
}
