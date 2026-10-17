// 客户端本地失败：这一发请求没拿到一份可解读的后端响应。与 error-codes.ts 分家——那份是后端在响应体里发的码（ErrorCodeVocabularyTest 四边核对回答「后端能发哪些码」），这几个码后端一个都不发、抛出点是本包自己，混进去会让那个问题有错答案、核对还要加豁免清单。两者在消费侧不分家（errorTextPlan 只看码在 catalog 有没有条目）。判据是有没有 HTTP 响应：NETWORK/TIMEOUT/ABORTED 的 status 都是 0，只有 RESPONSE_VALIDATION_FAILED 带真实 2xx。口径见 docs/error-codes.md。
export const ClientFailureCodes = {
    /** fetch 直接失败：断网、DNS、CORS 被拦，用户要做的是检查连接。分辨不出来的一律算这里（不猜第四种）：认错方向只是提示不贴切，漏判则是这条失败不进错误率 */
    NETWORK_ERROR: "NETWORK_ERROR",
    /** 10 秒超时（ky timeout）。与断网必须分开：一个是服务端没在等、一个是根本没接上，用户能做的动作正好相反（重试 vs 检查网络），压成一句两个都帮不上 */
    REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
    /** 调用方取消。TanStack Query 的 signal 透传进 SDK（web feed/商品详情都传），切路由/换页取消在途请求走这一族。它不是失败：计进接口错误率等于把「用户切了路由」报成接口故障。见 sdk-client.ts reportApi 前那个判断 */
    REQUEST_ABORTED: "REQUEST_ABORTED",
    /** HTTP 2xx 但响应体不符 OpenAPI 契约（SDK zod responseValidator 抛）。指向前后端契约没对上、不是服务挂了——状态码照实报 2xx，不编一个 5xx */
    RESPONSE_VALIDATION_FAILED: "RESPONSE_VALIDATION_FAILED",
} as const

export type ClientFailureCode = (typeof ClientFailureCodes)[keyof typeof ClientFailureCodes]
