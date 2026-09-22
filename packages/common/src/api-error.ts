import { z } from "zod"

import { ErrorCodes } from "./error-codes"

/** 后端统一错误响应（对等后端错误结构；契约漂移时由 toApiError 归一） */
export const ApiErrorSchema = z.object({
    title: z.string().optional(),
    status: z.number(),
    detail: z.string(),
    code: z.string().optional(),
    requestId: z.string().optional(),
    errors: z
        .array(
            z.object({
                field: z.string(),
                message: z.string(),
            }),
        )
        .optional(),
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

function fromZodError(status: number): ApiError {
    return {
        status,
        detail: "响应数据不符合接口契约",
        code: RESPONSE_VALIDATION_FAILED,
    }
}

/**
 * 任意抛出的错误 → 归一化 ApiError。
 * 生成 SDK 已通过错误拦截器把错误归一化为 { status, detail, code?, requestId? }，
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
        }
    }
    return { status: 0, detail: "请求失败，请稍后重试" }
}
