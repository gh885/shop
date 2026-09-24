# 横切全局行为

> 代码入口：packages/common（sdk-client、error-codes）、app-kit（QueryBoundary/notify/confirm）、createAppQueryClient、infra RequestIdFilter/GlobalExceptionHandler；入站校验词表在各领域类型（PhoneNumber、RegionRegistry、cms.dto.LinkTarget、UserCouponStatus、ProductSort、ProductFieldRules），门禁是 ValidationVocabularyTest；业务事件唯一出口是 infra.observability 的 BizEvent（`MdcScope` 只管信封），目录门禁是 BusinessEventCatalogTest。规则以代码为准沉淀，改代码请同步本文件。

## 错误码体系

- **[GEN-17]** 错误码定义原则：只有当 HTTP status 不足以让前端区分处理时才加 code；404/403 类不复述状态码，表单校验错误由 `errors[]` 列表承载、不造 code。唯一真相源 `docs/error-codes.md`，TS 侧手工逐条同步至 `error-codes.ts`（无一致性测试兜底，改一处必须改另一处；条数不在本条写死，以文件为准）。「前端行为」列允许是**无专属分支**那一档（如 `SHOP_NAME_TAKEN`/`USER_DISABLED`/`INSUFFICIENT_STOCK` 只是如实 toast detail）——这类 code 的价值在让文案可预期、可 grep、可测，不因「不驱动 if 分支」就违反定义原则；但该列必须写实际行为，不写承诺。

## 错误信封

- **[GEN-18]** 后端错误统一 RFC ProblemDetail 信封：`{ title, status, detail, code?, requestId, errors? }`，`requestId` 取链路 trace_id；所有错误响应带 `Cache-Control: no-store`。前端 SDK 错误拦截器把任意失败归一化为 `ApiError { status, detail, code?, requestId? }`；响应体无 `detail` 时兜底「请求失败，请稍后重试」，网络层错误（无响应）为 `status: 0` +「网络错误，请检查连接」。
- **[GEN-19]** 入参错误分三条线，形状各不相同：① **Bean Validation 失败 → 422 + `errors[{field,message}]`，不带 code**——`@RequestBody`（`MethodArgumentNotValidException`）与 `@RequestParam`/`@Validated` 约束（`ConstraintViolationException`）走同一个 `unprocessable` 组装，两处字段口径一致；② **请求根本解析不成参数 → 400，只有 detail 没有 errors**——缺必填查询参数、请求体不可解析（`HttpMessageNotReadableException`）、参数类型/枚举转换失败（`MethodArgumentTypeMismatchException`，回显值超 100 字符截断），三者同形状；③ **业务代码自判的非法筛选值 → service 层 400 带人话 detail**（订单 status、售后 tab 等，见 ORD-48 / AFS-28），不经 Spring 类型转换。前端表单被 Zod 拦下的不产生后端 code。**同一个「值不在合法表里」落哪条线，取决于门装在哪一层**：查询 DTO 上挂了 `@Pattern` 的（券包 status、商品 sort）走①＝422，字符串直收、service 用 `Validate.enumFilter` 自判的（订单/售后/审核）走③＝400。落点由 `ProductControllerTest.非法排序_422带字段名` 实测钉住，不是从注释推的（该注释曾错写 400）。
- **[GEN-28]** `RESPONSE_VALIDATION_FAILED` 是前端独有错误（后端 2xx 但 payload 不符合 OpenAPI 契约，zod responseValidator 抛出）：dev 完整打印 issues 到 console.warn；生产 console.error 打可 grep 上报锚点（不吞）；归一化 ApiError 的 status 取响应状态（toApiError 兜底路径为 200）。读路径按查询错误交给渲染层降级，写路径强抛。

## 传输与链路

- **[GEN-35]** 传输层全局策略：请求超时 10s；仅幂等 GET 在 408/429/502/503/504 自动重试 2 次（ky 原生）；所有请求自动注入 `Authorization: Bearer`（有 token 时）、`x-request-id`（值为 UUID 去横线的 32 位 hex，业务未显式传入时——与 GEN-36 后端 `RequestIdFilter` 的校验规则对齐，不合规格式会被后端丢弃重生成）、动态上下文头（如 seller `X-Shop-Id`，业务同名头优先）；请求一律 `credentials: "include"`。
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

- **[GEN-48]** 业务事件日志的唯一出口是 `BizEvent`（`infra.observability`）：`BizEvent.of("领域.事件").put("k", v)…emit()/warn()/error(cause)` 一次调用写完字段并打出那行。值为 null 即跳过该键，UUID/数值/枚举直接传，调用点不转字符串；`message` 由同一批字段生成（事件名 + 按写入顺序的 `k=v`），**调用点不写文案**——分成两份写就一定会漂（`shop_review.decided` 曾字段写 `decision=APPROVED`、文案打 `status=TRADING`，读文案的人拿到的是店铺营业状态）。信封字段（trace_id/version/env）仍由 RequestIdFilter 经 `MdcScope` 写，`MdcScope` 不再拿来手写 event：把「埋字段」和「打那行」拆成两步之后，忘了第二步就是一个静默丢失的事件（MDC 里写过了、日志里根本没有）。输出 ECS JSON，`event` 是检索/聚合/告警的唯一依据。
- **[GEN-49]** 事件命名：`领域实体.动词过去式`（成功/中性）与 `领域实体.动词.failed`（失败）；点分小写短标识、非中文非函数名，段内允许多词蛇形（`order.receiver_phone_revealed`），但段首段尾不能是下划线——这条形状由 `BusinessEventCatalogTest` 的正则判，不靠读注释。失败事件必带枚举化 `reason`；因渠道或异常而失败的那些再补 `error.type`/`error.message`。成功事件必带实体 ID。同一件事的多条路径共用一个事件名，用 `via`/`reason` 区分，不另起名字（另起会让聚合要先知道有几条路径）。
- **[GEN-50]** 事件目录只有一份：[business-event-logging.md](../conventions/business-event-logging.md) 的「已有事件目录」表，业务规则文档**不再抄第二份字段表**（这一条曾把十个事件连字段抄进 crosscut，代码改了它不会红）。规则文档讲到后果时指名单个事件是可以的——它是那条规则的凭据，不是一份目录。表与代码由 `BusinessEventCatalogTest`（无库、纯文本扫描）逐条核对：事件名双向相等、表里列为必带的字段每个埋点都写、埋点写出的字段表里都列着、列为可选的至少有一个埋点真写、一个事件名在表里只能有一行、规则文档反引号点名的事件目录里都得有（末段词表取自目录本身，故库路径 `account.users.deletion_requested_at` 这类同名形状不会被误判）。这里只记判据：值得立事件的是钱（`payment.refunded` / `payment.refund.failed`）、不可逆（`user.deleted`）、以及「谁动了谁的数据」（三条 `*_revealed`、`shop_review.decided`、两条 `*.status.changed`）；新增公共出站依赖必须先补埋点再上线。
- **[GEN-51]** 日志红线：不往 MDC 放密码/token/身份证号等敏感信息。手机号后 4 位掩码的唯一后端出口是 `PhoneNumber.mask()`，现行 9 个调用点（`/me` 出参、开发态短信日志、重置密码发送、登录失败与登录限流两条事件出口、卖家订单列表行、卖家订单详情的卖家视角、平台审核队列出参、店铺成员列表的他人行）；口径只有一条：**任何批量出参都不带别人或买家的手机号明文**，明文只能逐条显式索取且取用留痕（买家侧 ORD-62，店主/成员侧 ACC-79）。唯一保留的明文是**操作者自己的号**（成员列表本人那行）。前端掩码同样只有一个出口：`@shop/common` 的 `maskPhone` / `MASK_SEGMENT`（位数不足原样返回，不伪造掩码——与后端相反的那条兜底是各自的取舍，不是漂移）。`ui-web` 的 `MaskedValue` 因刻意零内部依赖另持一份 `MASK_SEGMENT`，由 `shared-vocabulary.test.ts` 钉「与 common 逐字节相等」。全局敏感字段审计仍列为延后项。

## 入站校验词表

- **[GEN-52]** 一条形状规则只有一处定义，且定义住在**持有该概念的领域类型**里：DTO 的 `@Pattern`/`@Size` 引用常量、不抄字面量。现行词表出口——`PhoneNumber.CHINA_MOBILE_PATTERN` / `PhoneNumber.CONTACT_PATTERN`（ACC-40）、`RegionRegistry.CODE_PATTERN` / `PREFIX_PATTERN`（LOG-48）、`cms.dto.LinkTarget.PATTERN`（CMS-05）、`UserCouponStatus.PATTERN`（CPN-52）、`ProductSort.PATTERN`（PRD-63）、`ProductFieldRules.{NAME_MAX,NAME_MESSAGE,SELL_POINT_PATTERN,SELL_POINT_MESSAGE}`（PRD-20/42）。`LinkTarget`、`ProductSort` 是为持词表新建的类型，但**字段类型仍是 String**——换成枚举会改 OpenAPI 形状；它们另提供 `fromWire` 把词表解析收成一处（`ProductSort` 顺带替掉 switch 里散落的字符串字面量）。
- **[GEN-53]** 注解元素值必须是编译期常量表达式（`String.join`、stream 推导都非法），所以「常量逐字节等于枚举名 / wire 值 / 真实区划码」这条等式编译期查不了，改由 `ValidationVocabularyTest`（无库、反射+扫源码）在测试期钉：词表与枚举名逐字对齐、排序词表与 `ProductQueryService` 的 switch 分支一一对应（Java 对 switch **语句**不做穷尽检查，加了枚举值忘了加分支只有这里能红）、手机号三档放行的号 `PhoneNumber.of()` 必接得住、区划码形状与 `regions.json` 真值同形。该测试自带反空转断言（常量引用数为 0 就红），并规定「同一个字面量不许出现在两个文件里」。**它与契约无重叠**：形状对不对由 `ApiDocsContractTest` 判，本条只判定义在哪。
- **[GEN-54]** 改词表 = 改接口：`@Pattern`/`@Size` 的值会导出进 `openapi/api-docs.json` 和生成的 zod（`packages/api/src/sdk/zod.gen.ts`），动一个字符就得先起后端跑 `pnpm gen:sdk`，否则 `ApiDocsContractTest` 把不一致判红。因此「内部收口」级别的改动，替换值必须与被替换字面量**逐字节相同**（含 message 文案）。形似而概念不同的规则**不许合并**：商家地址邮编与区划码同为 6 位数字，各留一份，合并会让一处放宽静默改掉另一处。声明式形状门与权威判定按概念分层而不是各写一遍——区划码「形对但不存在」（`RegionRegistry.requireValidCode`/`requirePrefix`，400 话术唯一出口，service 不再各写 `validateRegion`）、联系电话「形松但归一化后不是号」（`PhoneNumber.of()`）都由领域类型补第二道门；空格/括号不在联系人档门内是**现行契约**而非疏漏，放宽属接口变更。
- **[GEN-55]** 一条业务事实只打一行：同一事实的第二份拷贝要逐处删掉。登录失败曾先按分支打一句人读 warn、再打一条同因事件（两份 `reason`，改一处另一处静默过期），现在只剩事件；下单曾打「单数 + 总应付」的汇总行，而每单的 `order.created` 已各自带 `pay_amount`，单数与总额由检索侧按 `checkout_key` 聚合，汇总行删。判据：如果第二行只是第一行的另一种措辞或它的计数/求和，它就不是新信息。留在普通 `log` 里的必须是另一类东西（诊断、流程叙述，见 GEN-50 的「什么才立一条事件」），不是同一事实的第二次抄写。
