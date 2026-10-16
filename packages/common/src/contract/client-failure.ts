/**
 * 客户端本地失败：**这一发请求没有拿到一份可解读的后端响应**。与 `error-codes.ts` 分家——那份是后端在响应体里发的码（`ErrorCodeVocabularyTest` 拿它与 `contracts/error-codes.yaml`、Java `common.ErrorCodes` 四边核对，回答「后端能发哪些码」），这几个码后端一个都不发、抛出点是本包自己，混进去会让那个问题有错的答案、四边核对还要加豁免清单。两者在**消费侧不分家**（`errorTextPlan` 取文案只看码在 catalog 有没有条目，`ErrorCodeVocabularyTest` 核的也是并集）。判据是「有没有 HTTP 响应」：`NETWORK_ERROR`/`REQUEST_TIMEOUT`/`REQUEST_ABORTED` 的 status 都是 0，只有 `RESPONSE_VALIDATION_FAILED` 带真实 2xx。口径见 docs/error-codes.md。
 */
export const ClientFailureCodes = {
    /**
     * fetch 直接失败：断网、DNS、CORS 被拦。用户要做的是**检查连接**。
     *
     * 分辨不出来的一律算这里（不猜第四种）：认错方向的代价是给出一句不贴切的提示，
     * 而漏判的代价是这条失败不进错误率。
     */
    NETWORK_ERROR: "NETWORK_ERROR",
    /**
     * 10 秒超时（ky 的 `timeout`）。与断网**必须分开**：一个是「服务端没在等」，一个是「根本没接上」，
     * 用户能做的动作正好相反（重试 vs 检查网络），压成同一句等于两个都帮不上。
     */
    REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
    /**
     * 调用方取消。TanStack Query 的 `signal` 是**透传进 SDK** 的（web 的 feed 与商品详情取数都传了），
     * 所以切路由 / 换页取消在途请求走的就是这一族。
     *
     * 它**不是失败**：计进接口错误率就等于把「用户切了路由」报成接口故障。
     * 见 `sdk-client.ts` 里 `reportApi` 前面那个判断。
     */
    REQUEST_ABORTED: "REQUEST_ABORTED",
    /**
     * HTTP 2xx 但响应体不符合 OpenAPI 契约（生成 SDK 的 zod responseValidator 抛出）。
     * 指向的是前后端契约没对上，不是服务挂了——所以状态码照实报 2xx，不编一个 5xx。
     */
    RESPONSE_VALIDATION_FAILED: "RESPONSE_VALIDATION_FAILED",
} as const

export type ClientFailureCode = (typeof ClientFailureCodes)[keyof typeof ClientFailureCodes]
