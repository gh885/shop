import { z } from "zod"

import { ErrorCodes } from "./error-codes"

/**
 * 422 那一发的字段级明细（后端 `GlobalExceptionHandler.unprocessable` 挂在 ProblemDetail 的
 * 扩展属性 `errors` 上），以及 400 里那条参数通道（COM-01 违禁词，`BusinessException.badRequest`
 * 的第三参）。它**不在 OpenAPI 契约里**（ProblemDetail 的扩展属性不进 api-docs），
 * 所以这一份是前端侧按运行时形状声明的，改它不需要 `pnpm gen:sdk`。
 */
export const ApiFieldErrorSchema = z.object({
    /** 机器的字段名（DTO / 表单的键），前端按它定位到输入框——不是中文标签 */
    field: z.string(),
    message: z.string(),
    /**
     * 那条规则实际作用到的**数据**（命中的违禁词、越界的那个数字）。
     * 有它才能把句子参数化：前端 catalog 写 `包含违禁词「{word}」`，不用再从中文 detail 里正则捞。
     */
    value: z.string().optional(),
})
export type ApiFieldError = z.infer<typeof ApiFieldErrorSchema>

/** 后端统一错误响应（对等后端错误结构；契约漂移时由 toApiError 归一） */
export const ApiErrorSchema = z.object({
    title: z.string().optional(),
    status: z.number(),
    detail: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
    errors: z.array(ApiFieldErrorSchema).optional(),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

/**
 * 响应契约校验失败（生成 SDK 的 zod responseValidator 抛出）。
 * 这是前端独有的错误来源：HTTP 本身成功，但 payload 不符合 OpenAPI 契约（后端契约漂移）。
 */
export const RESPONSE_VALIDATION_FAILED = ErrorCodes.RESPONSE_VALIDATION_FAILED

export function isZodError(err: unknown): err is z.ZodError {
    return err instanceof z.ZodError
}

/** 把 ZodError 的 issues 压成一行可读文本（打日志/上报用） */
export function zodIssuesText(err: z.ZodError): string {
    return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
}

/**
 * 从错误体里取字段级明细：只收「field 与 message 都是字符串」的条目，其余丢掉，留下的也只按
 * 声明的那三格重建（后端多给一格不进 ApiError，免得它顺着上报与序列化漏成第四种形状）。
 *
 * 丢而不是留着，是因为下游拿它把输入框标红：一条 `field` 是数字、或 `message` 缺失的脏记录，
 * 表现是标到一个不存在的字段上、句子没有谓语——后端形状变了要在这里红，不能漏到界面上。
 * 空数组当没有：`errors: []` 与「没有字段级信息」对调用方是同一件事。
 */
export function fieldErrorsOf(err: object): ApiFieldError[] | undefined {
    const raw = (err as { errors?: unknown }).errors
    if (!Array.isArray(raw)) return undefined
    const clean: ApiFieldError[] = []
    for (const item of raw) {
        if (typeof item !== "object" || item === null) continue
        const { field, message, value } = item as {
            field?: unknown
            message?: unknown
            value?: unknown
        }
        if (typeof field !== "string" || typeof message !== "string") continue
        clean.push(typeof value === "string" ? { field, message, value } : { field, message })
    }
    return clean.length > 0 ? clean : undefined
}

function fromZodError(status: number): ApiError {
    return {
        status,
        detail: "响应数据不符合接口契约",
        code: RESPONSE_VALIDATION_FAILED,
    }
}

/**
 * 任意抛出的错误 → 归一化 ApiError。
 * 生成 SDK 已通过错误拦截器把错误归一化为 { status, detail, code?, requestId?, errors? }，
 * 这里兜底把其它异常（网络层、zod 契约校验等）也拢成同一形状，供调用方用 code/status 分支处理。
 */
export function toApiError(err: unknown): ApiError {
    if (isZodError(err)) return fromZodError(200)
    if (
        typeof err === "object" &&
        err !== null &&
        "detail" in err &&
        typeof err.detail === "string"
    ) {
        return {
            status: "status" in err && typeof err.status === "number" ? err.status : 0,
            detail: err.detail,
            code: "code" in err && typeof err.code === "string" ? err.code : undefined,
            requestId:
                "requestId" in err && typeof err.requestId === "string" ? err.requestId : undefined,
            errors: fieldErrorsOf(err),
        }
    }
    return { status: 0, detail: "请求失败，请稍后重试" }
}
