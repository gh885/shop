import { toApiError } from "./api-error"

/**
 * 生成 SDK 的 `{ data, error }` 结果 → 值。
 *
 * <p>为什么每个 api 方法都要来这么一下：hey-api 生成的 SDK 不抛异常，它返回 Result 形状把「是否抛」
 * 的决定权交给调用方；而 TanStack Query 判定失败的唯一信号是 queryFn **抛异常**。两边的错误契约对不上，
 * 中间必须有人把 Result 转成 throw——就是这一句。所以调用次数随接口数线性增长，但转换逻辑只该有一份。
 *
 * <p>这里统一 `throw toApiError(res.error)`：SDK 错误拦截器已把绝大多数字部分归一化为 ApiError，
 * 而 toApiError 兜底把任何非规范错误（裸字符串、network、未知对象）也拢成同一形状。
 * 因此**所有经 unwrap 抛出的错误都保证是 ApiError**——调用方（TanStack Query 的 queryFn）
 * 可直接断言 `error.detail` / `error.code`，无需再包一层 toApiError。
 */
export function unwrap<T>(res: { data?: T; error?: unknown }): T {
    if (res.error) throw toApiError(res.error)
    return res.data as T
}
