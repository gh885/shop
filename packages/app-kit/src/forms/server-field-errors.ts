import { fieldErrorsOf, toApiError } from "@shop/common/contract"
import { fieldErrorFact, type FieldErrorFact } from "../i18n/field-error-fact"

/** 源（DTO 键）不约束（逐表单写），目标约束到 TForm：拼错表单字段名在这里就红，后果是错误挂到不存在的框上 */
export type ServerFieldMap<TForm> = Partial<Record<string, Extract<keyof TForm, string>>>

/** 表单字段可承载的错误：可本地化事实（key+params，渲染时按当前语言出句）或已成句的字符串；两种渲染层都认，与本地 Zod 同一条道 */
export type ServerFieldErrorValue = FieldErrorFact | string

/**
 * 后端 422 字段级明细 → 表单字段名 → 可本地化的事实（错误码判据 的 422 参数通道，前端一半）
 * 纯函数不 hook：写进表单 meta 需 react-form 类型，那只住 @shop/ui-web（见 applyServerFieldErrors），这层不碰表单
 * 给了 map 就以它为准：没列的字段跳过、不回落同名（挂到不存在的框比不显示更难排查）；不给则视为同名
 */
export function serverFieldErrors<TForm extends Record<string, unknown>>(
    error: unknown,
    map?: ServerFieldMap<TForm>,
): Record<string, ServerFieldErrorValue> {
    const entries = fieldErrorsOf(toApiError(error)) ?? []
    const out: Record<string, ServerFieldErrorValue> = {}
    for (const entry of entries) {
        if (map !== undefined && map[entry.field] === undefined) continue
        const formField = map?.[entry.field] ?? entry.field
        // 同一字段多条（长度 + 格式）取第一条（后端按注解排序，一个框只显示一句）
        if (out[formField] !== undefined) continue
        // rule 认得 → 可本地化事实；认不得 → 按 locale 的通用校验句，不退回 entry.message（后端成品中文=漏语种）
        out[formField] = fieldErrorFact(entry) ?? { message: "error.validation" }
    }
    return out
}
