import type { ApiError } from "@shop/api"

/**
 * 任意抛出的错误 → 归一化 ApiError。
 * 生成 SDK 已通过错误拦截器把错误归一化为 { status, detail, code?, requestId? }（见 @shop/api/sdk-client），
 * 这里兜底把其它异常（网络层等）也拢成同一形状，供调用方用 code/status 分支处理。
 */
export function normalizeApiError(err: unknown): ApiError {
    if (
        typeof err === "object" &&
        err !== null &&
        "detail" in err &&
        typeof (err as ApiError).detail === "string"
    ) {
        const e = err as ApiError
        return {
            status: e.status ?? 0,
            detail: e.detail,
            code: e.code,
            requestId: e.requestId,
        }
    }
    return { status: 0, detail: "请求失败，请稍后重试" }
}
