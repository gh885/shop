/**
 * 生成 SDK 的 `{ data, error }` 结果 → 值。
 *
 * <p>为什么每个 api 方法都要来这么一下：hey-api 生成的 SDK 不抛异常，它返回 Result 形状把「是否抛」
 * 的决定权交给调用方；而 TanStack Query 判定失败的唯一信号是 queryFn **抛异常**。两边的错误契约对不上，
 * 中间必须有人把 Result 转成 throw——就是这一句。所以调用次数随接口数线性增长，但转换逻辑只该有一份。
 *
 * <p>抛出的是 SDK 错误拦截器已归一化过的 ApiError 形状（见 sdk-client.ts），调用方用 toApiError 收口即可。
 */
export function unwrap<T>(res: { data?: T; error?: unknown }): T {
    if (res.error) throw res.error
    return res.data as T
}
