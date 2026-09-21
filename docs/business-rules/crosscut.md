# 横切全局行为

> 代码入口：packages/common（sdk-client、error-codes）、app-kit（QueryBoundary/notify/confirm）、createAppQueryClient、infra RequestIdFilter/GlobalExceptionHandler。规则以代码为准沉淀，改代码请同步本文件。

## 错误码体系

- **[GEN-17]** 错误码定义原则：只有当 HTTP status 不足以让前端区分处理时才加 code；404/403 类不复述状态码，表单校验错误由 `errors[]` 列表承载、不造 code。唯一真相源 `docs/error-codes.md`，TS 侧同步至 `error-codes.ts`（当前两边 16 个 code 完全一致，无漂移）。

## 错误信封

- **[GEN-18]** 后端错误统一 RFC ProblemDetail 信封：`{ title, status, detail, code?, requestId, errors? }`，`requestId` 取链路 trace_id；所有错误响应带 `Cache-Control: no-store`。前端 SDK 错误拦截器把任意失败归一化为 `ApiError { status, detail, code?, requestId? }`；响应体无 `detail` 时兜底「请求失败，请稍后重试」，网络层错误（无响应）为 `status: 0` +「网络错误，请检查连接」。
- **[GEN-19]** 字段级校验失败统一 422 + `errors[{field,message}]`（`@RequestBody` 与 `@RequestParam` 约束同一契约），不带 code；前端表单被 Zod 拦截的不产生后端 code。
- **[GEN-28]** `RESPONSE_VALIDATION_FAILED` 是前端独有错误（后端 2xx 但 payload 不符合 OpenAPI 契约，zod responseValidator 抛出）：dev 完整打印 issues 到 console.warn；生产 console.error 打可 grep 上报锚点（不吞）；归一化 ApiError 的 status 取响应状态（toApiError 兜底路径为 200）。读路径按查询错误交给渲染层降级，写路径强抛。

## 传输与链路

- **[GEN-35]** 传输层全局策略：请求超时 10s；仅幂等 GET 在 408/429/502/503/504 自动重试 2 次（ky 原生）；所有请求自动注入 `Authorization: Bearer`（有 token 时）、`X-Correlation-Id`（UUID，业务未显式传入时）、动态上下文头（如 seller `X-Shop-Id`，业务同名头优先）；请求一律 `credentials: "include"`。
- **[GEN-36]** 后端链路 ID：`RequestIdFilter` 读入站 `x-request-id`（须为 32 位 hex，不合法则自生成 UUID 去横线），回写同名响应头并注入 MDC `trace_id`（进错误信封 `requestId` 与全部日志）；`@Async/@Scheduled` 经 `MdcTaskDecorator` 延续或新起 trace_id。

## 写操作反馈

- **[GEN-38]** 写操作一律用库 `useMutation`，反馈与后果走官方 `meta` 通道（`MutationMeta` 只有 4 个字段，经 `Register` 类型增强，拼错字段编译不过），由 `createAppQueryClient()` 里的全局 `MutationCache` 一次执行，不包 hook 工厂：`meta.success` 有值即 `notify.success` toast；`meta.invalidates` 逐个 `invalidateQueries`；失败且非 `meta.silentError` 时 `notify.fromError(error, meta.error)`。
- **[GEN-39]** 提示语义：`success` 不填即不提示（高频操作如购物车勾选/改数量刻意静默；无 `silentSuccess` 开关，「要不要提示」由字段有/无承载）；`error` 只是兜底文案——后端有 `detail` 时永远 detail 优先，只有 `status === 0`（网络层错误）才用 `meta.error`。
- **[GEN-40]** `invalidates` 必须传真实 query key（前缀匹配命中整棵子树），不发明 tag 表；「由变量算出的 key」失效用库自己的 `onSuccess`（第 2 参 variables、第 4 参带 client）。不传 `invalidates` = 显式声明不改变任何缓存，不是漏写。
- **[GEN-41]** 全局回调先于逐点回调执行（TanStack 官方顺序），因此：失效发生在调用方 onSuccess 善后之前；想在失败时「先拦住」全局 toast 只能通过 `meta.silentError` 显式声明（逐点 onError 抑制不了），且只有「错误已在别处被用户看见」（表单内联报错、登出后已在登录页）才允许用它。
- **[GEN-42]** 乐观更新固定 `optimisticListMutationOptions` 一次实现官方三步（onMutate 取消在途→快照→patch；onError 回滚；onSettled 失效），领域只供「怎么 patch」，反馈仍归全局。
- **[GEN-43]** 危险操作二次确认走全局 `confirm({ title, description, confirmText, action })`（与 notify 同级收口，根布局只挂一份 `<ConfirmDialogHost />`）：`action` 传 `mutation.mutateAsync(...)`——promise 期间按钮转圈、成功关面、失败保持打开等重试（错误提示已由全局弹过不重复）；只在客户端事件回调里调。

## 错误呈现

- **[GEN-44]** `throwOnError: throwWhenNoData` 是全局默认（`createAppQueryClient`）：只有「一条数据都没有」时才把查询错误抛给边界；有旧数据的后台重取失败不炸页。判据逐字等同官方 suspense 内部默认，`useSuspenseQuery` 用自己的同名判据覆盖、不受客户端默认影响。
- **[GEN-45]** 退出默认的唯一判据是「头上有没有可接的边界」：页面主体→路由 `errorComponent`（`RouteErrorFallback`）；区块/弹窗内部件→`QueryBoundary`（`@shop/app-kit`）；角标/收藏心形等无边界附属件必须显式 `throwOnError: false` 就地渲染 isError + 官方 `refetch()` 重试。`useSuspenseQuery` 要退出默认只能在调用点内联写（写进共享 options 静默失效）。
- **[GEN-46]** 查询默认兜底：`staleTime: 10s`（挡 mount 即重拉；结算预览类显式 `staleTime: 0`）、`retry` 保持库默认 3 次指数退避（404 有业务含义的查询显式 `retry: false`）。
- **[GEN-47]** 错误重试与刷新分道：`invalidateQueries` 只用于 mutation 之后刷数据；查询失败态的「重试」由边界的官方 reset 完成（Router `reset()` + `QueryErrorResetBoundary.reset()`，三端 Provider 树已挂、`QueryBoundary` 自带一层）。

## 业务事件日志

- **[GEN-48]** 业务事件日志 = 手动埋 event + 框架自动补信封（trace_id/version/env 由 RequestIdFilter 进 MDC），ECS JSON 输出；`event` 是检索/聚合/告警唯一依据，message 留空或人读描述；场景字段进 MDC，作用域结束自动回滚（实现为 `MdcScope` try-with-resources，嵌套恢复外层原值）。
- **[GEN-49]** 事件命名：`领域实体.动词过去式`（成功/中性）与 `领域实体.动词.failed`（失败）；短标识、非中文、非函数名、非蛇形。失败事件必带枚举化 `reason`（及 `error.type`/`error.message`）；成功事件必带实体 ID。
- **[GEN-50]** 现行事件目录：`http.request`——每请求自动打（`method/path(路由模板)/status/latency_ms/client_ip`，status≥500 升 ERROR 级）；`auth.login.succeeded`——带 `user_id`（AuthService.issueTokens）；`auth.login.failed`——带 `reason`（user_not_found/no_password/wrong_password）+ `client_ip`，user_id 可选。新增公共出站依赖必须先补埋点再上线。
- **[GEN-51]** 日志红线：不往 MDC 放密码/token/身份证号等敏感信息；手机号目前仅 `maskPhone()` 一处脱敏（全局敏感字段审计列为延后项）。
