import { z } from "zod"

import { ClientFailureCodes } from "./client-failure"

/** 字段级明细的一格（后端 GlobalExceptionHandler 挂在 ProblemDetail 扩展属性 errors 上）+ 400 的参数通道。wire 形状唯一来源是 OpenAPI 契约；这份是前端归一化后的形状，只用于 toApiError 兜底解读非 HTTP 来源错误、以及契约校验没过时的宽松降级。 */
export const ApiFieldErrorSchema = z.object({
    /** 机器字段名（DTO/表单键），嵌套用 items[0].quantity 属性路径——不是中文标签 */
    field: z.string(),
    /** 后端注解上那句成品中文。日志与「拿不到 rule 时的中文兜底」靠它，不是给用户看的那句 */
    message: z.string(),
    /** 规则实际作用到的数据（命中的违禁词、越界的数字）：有它才能参数化句子，不用再从中文 detail 里正则捞 */
    value: z.string().optional(),
    /** 违反了哪条规则（ValidationRules 取值）：前端据此出自己的语言句子、不显示 message 那句中文。词表外约束后端只给 message 不带这格 */
    rule: z.string().optional(),
    /** 规则边界：一律 JSON 数字，后端常量改了这边跟着变 */
    min: z.number().optional(),
    max: z.number().optional(),
})
export type ApiFieldError = z.infer<typeof ApiFieldErrorSchema>

/** 那条错误的结构化上下文：把「必须原样给用户、只有后端知道」的值从句子里拆出来当数据出（首个使用者是两条地址上限码，上限住后端常量、写进 catalog 就是会谎报的字面量）。与 errors 分工：errors 定位字段（按 field 标红），params 定位这条错误的原因（没有输入框可标红）。只收标量三态，wire 形状权威在 api-docs.json。 */
export const ApiParamsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
export type ApiParams = z.infer<typeof ApiParamsSchema>

/** 前端统一处理的错误形状（不是 wire 形状——wire 是契约的 ApiProblem）；归一化每格白名单重建，没列到的扩展属性不进来。刻意没有 title：那是 RFC 9457 英文 reason phrase、对用户没用且从没填过。要按状态码分流直接用 status。 */
export const ApiErrorSchema = z.object({
    status: z.number(),
    detail: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
    errors: z.array(ApiFieldErrorSchema).optional(),
    params: ApiParamsSchema.optional(),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

/** 响应契约校验失败（SDK zod responseValidator 抛）：HTTP 成功但 payload 不符 OpenAPI 契约。这是前端独有的客户端本地失败（client-failure.ts），不是后端码——故住那份词表，不出现在 ErrorCodes 里 */
export const RESPONSE_VALIDATION_FAILED = ClientFailureCodes.RESPONSE_VALIDATION_FAILED

export function isZodError(err: unknown): err is z.ZodError {
    return err instanceof z.ZodError
}

/** 是不是一次已经面向用户说过了的失败（后端错误/网络失败）——即错误体形状那一类。判据就是 toApiError 一直用的那条：对象+带字符串 detail。用来分两类：这类静默吞掉没问题（提示已由全局反馈发出），另一类（TypeError 等代码坏了）不能静默、要上报监控。一个判据两处用故收在这。 */
export function isApiError(err: unknown): err is ApiError {
    return (
        typeof err === "object" && err !== null && "detail" in err && typeof err.detail === "string"
    )
}

/** 把 ZodError 的 issues 压成一行可读文本（打日志/上报用） */
export function zodIssuesText(err: z.ZodError): string {
    return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
}

/** 从错误体取字段级明细：只收 field 与 message 都是字符串的条目、按声明的几格重建，其余丢掉。丢而非留是因为下游拿它标红输入框，脏记录会标到不存在的字段上、句子没谓语——后端形状变了要在这红，不能漏到界面。空数组当没有。 */
export function fieldErrorsOf(err: object): ApiFieldError[] | undefined {
    const raw = (err as { errors?: unknown }).errors
    if (!Array.isArray(raw)) return undefined
    const clean: ApiFieldError[] = []
    for (const item of raw) {
        const one = fieldErrorOf(item)
        if (one !== undefined) clean.push(one)
    }
    return clean.length > 0 ? clean : undefined
}

/** 一条明细的白名单重建：只收 field/message 与那几标量槽位，其余不进来（ApiError 会进上报，漏进去的键等于给监控一个没声明的形状）。类型不符的丢掉而不让整格消失。 */
function fieldErrorOf(item: unknown): ApiFieldError | undefined {
    if (typeof item !== "object" || item === null) return undefined
    const { field, message, value, rule, min, max } = item as Record<string, unknown>
    if (typeof field !== "string" || typeof message !== "string") return undefined
    return {
        field,
        message,
        ...(typeof value === "string" ? { value } : {}),
        ...(typeof rule === "string" ? { rule } : {}),
        ...(typeof min === "number" ? { min } : {}),
        ...(typeof max === "number" ? { max } : {}),
    }
}

/** 从错误体取结构化上下文：只保留标量值条目，其余丢弃（理由同 fieldErrorsOf）。空对象当没有——否则调用方判完 params?.limit 还得再判一次空。 */
export function paramsOf(err: object): ApiParams | undefined {
    const raw = (err as { params?: unknown }).params
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined
    const clean: ApiParams = {}
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            clean[key] = value
        }
    }
    return Object.keys(clean).length > 0 ? clean : undefined
}

function fromZodError(status: number): ApiError {
    return {
        status,
        detail: "响应数据不符合接口契约",
        code: RESPONSE_VALIDATION_FAILED,
    }
}

/** 任意抛出的错误 → 归一化 ApiError。SDK 已通过错误拦截器把错误归一成 { status, detail, code?, requestId?, errors?, params? }，这里兜底把其它异常（网络层、zod 契约校验等）也拢成同一形状，供调用方按 code/status 分支。 */
export function toApiError(err: unknown): ApiError {
    if (isZodError(err)) return fromZodError(200)
    if (isApiError(err)) {
        return {
            status: "status" in err && typeof err.status === "number" ? err.status : 0,
            detail: err.detail,
            code: "code" in err && typeof err.code === "string" ? err.code : undefined,
            requestId:
                "requestId" in err && typeof err.requestId === "string" ? err.requestId : undefined,
            errors: fieldErrorsOf(err),
            params: paramsOf(err),
        }
    }
    return { status: 0, detail: "请求失败，请稍后重试" }
}
