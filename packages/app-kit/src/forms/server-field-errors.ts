import { fieldErrorsOf, toApiError } from "@shop/common/contract"
import { fieldErrorFact, type FieldErrorFact } from "../i18n/field-error-fact"

/**
 * DTO 字段名 → 表单字段名。
 *
 * <p>源（DTO 的键）不约束：**这份清单是逐表单写的**，DTO 有哪些字段不归它管。
 * 目标（表单值的键）约束到 `TForm`：拼错表单字段名在这里就红（`"receiver": reciever` 不行），
 * 而那类错的后果是「错误挂在不存在的框上」——用户看不到、开发者也排查不动。
 */
export type ServerFieldMap<TForm> = Partial<Record<string, Extract<keyof TForm, string>>>

/**
 * 表单字段可承载的错误：要么是**可本地化的事实**（`{ message: catalog key, params }`，
 * 句子由渲染边界按当前语言出），要么是已经成句的字符串（表单自己写死的场景文案）。
 * 渲染层（ui-web 的 `FieldError` → `FormErrorTranslateProvider`）两种都认，与本地 Zod 走同一条道。
 */
export type ServerFieldErrorValue = FieldErrorFact | string

/**
 * 后端 422 的字段级明细 → **表单字段名 → 可本地化的错误事实**（docs/error-codes.md 的 422 参数通道）。
 *
 * <p>这是那条通道的前端一半：此前各表单标红全部来自本地 Zod，后端说「超了 / 格式不对」时前端不知道——
 * 422 那一族实际上是**只对开发可见**的。现在后端给 `rule`（+ `min`/`max`），句子由 catalog 按界面语言出。
 *
 * <p>为什么是纯函数而不是 hook：写进表单 meta 那一步需要 `@tanstack/react-form` 的类型，而它只住在
 * `@shop/ui-web`（见 `applyServerFieldErrors`）。这一层不碰表单，所以留在 app-kit 也不必引表单库。
 *
 * <p>**不再收 `locale`**（2026-10 改版）：改版前这里就把句子翻好存进表单状态，于是切语言后
 * 已显示的服务端错误还是旧语言，而本地 Zod 那半会变——同一页两种行为。现在只把**事实**交给表单，
 * 句子在渲染时按当前语言出，与本地校验那半逐字同形；`locale` 不必再从每个调用点一路传下来。
 *
 * <p>**给了 `map` 就以它为准**：没列出的字段（DTO 有、表单没有，比如 `isDefault`）直接跳过，
 * 不回落成同名——挂到一个不存在的框上比不显示更难排查。不给 `map` 则认为两者同名。
 *
 * @param error 任意抛出的错误（`ApiError` / SDK 归一化后的对象 / 别的异常）
 * @param map DTO 字段名 → 表单字段名；**要接入哪几个框就列哪几个**，同名字段也列出来（列出来是「我确认过它同名」）
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
        // 同一字段多条（长度 + 格式）时取第一条：表单一个框只显示一句。
        // 顺序由后端按注解读（先长度后格式），第一条已经够指认问题；真要两句得先定排版策略
        if (out[formField] !== undefined) continue
        // rule 认得 → 可本地化的事实（带边界）；认不得（词表外的约束）→ 按 locale 的通用校验句。
        // 不再退回 `entry.message`：那是后端成品中文，非中文界面显示它就是漏语种——与 errorTextPlan
        // 挡住的那件事同一类。词表覆盖满之后这条分支是防御性的：真走到就是契约破口，该补词表而不是抄句子。
        out[formField] = fieldErrorFact(entry) ?? { message: "error.validation" }
    }
    return out
}
