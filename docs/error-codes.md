# Error Codes

判据（2026-09-30 改版）：**用户看到的句子由前端 catalog 或状态码通道给；`detail` 只在中文界面当文案，其它语种它是日志字段。** code 的准入条件是「前端要按它做不同的事」或「这句话被兜底接住的真实频次证明它值得单独翻译」——不是「后端有一句话」。唯一真相源是本表。

> **判据为什么不再按字面执行**（旧那句是「这句话用户可见，就要有 code」，2026-09-30 普查把它否了）：`apps/server/src/main/java` 里的报错出口共 **304 处**，带 code 的 **37 处**，不带 code 的 **267 处**（按状态码 400:112 / 404:78 / 409:56 / 401:11 / 403:8 / 429:2）；这 267 处的内联中文句子去重 **204 句**（另有 10 处的句子由变量或拼接给出，数不出字面量）。按旧判据字面执行 = 新建 204 个码，每个码四件（Java 常量 / 本表一行 / 两份语言各一句 / `error-keys.ts` 一格），而 catalog 今天一共 25 条。更要紧的是那 267 处里绝大多数前端从不按句子分叉：404 那 78 处全是「XX 不存在」，状态码那条通道本来就覆盖它；409 的 56 处是并发/状态冲突，通用句加重试即可。补齐全量只会把中文句子换个地方抄一遍，并把「哪个码重要」这个产品判断变成一次性的 204 个猜测。
>
> **普查口径**（数字会漂，规则不会；引用数字前先重数一遍）：扫 `apps/server/src/main/java/**/*.java`，算出口的是 `Validate.*` / `BusinessException.*` / `new BusinessException(` 的调用点，扣掉两个收口文件自身（`Validate.java`、`BusinessException.java`）与注释里的例子；「带 code」= 顶层实参里出现 `ErrorCodes.X`；「句」= 实参里含中文的字符串字面量去重。
>
> **落地位置**（[i18n.md §7.3](conventions/i18n.md)）：文案住前端 catalog（`packages/app-kit/src/locales/{zh-CN,en-US}/error.json` 的 `error.<CODE>`），后端 `detail` 降级为**日志与诊断字段**——除上面判据明写的那一格：中文界面仍然拿它当文案。
>
> 契约三行与现状的对应，逐行说清，别把没成立的那行当成已经成立：
>
> - 已知 code → `error.<CODE>` 的本地化文案 —— **成立**（catalog 25 条全部走这条；句子里的数字由 `params` / `errors` 参数化，见下面两条通道）
> - 未知 code / 无 code 的 400、422 → 本地化通用提示 —— **非中文界面成立**：`errorTextPlan` 最后一支按状态码给通用句，`appKit.error.{badRequest,unauthorized,forbidden,notFound,conflict,validation,rateLimited,serverError,network}` 九条两份语言齐。中文界面不成立且**是有意的**——那里后端那句是同语言且更具体的（第 3 支），本期承认，边界见 §7.3 一期边界
> - `detail` → **不进非中文界面**成立（例外清单已空，中文句子不会出现在英文界面；网络层错误走 `appKit.error.network`，不带 detail）；「不进任何用户可见路径」这句在中文界面不成立，也不必成立
>
> **兜底与升级（判据的第二半，缺了它这条链就是死路）**：取文案的那五支是一个纯函数（`errorTextPlan`，`packages/app-kit/src/i18n/error-keys.ts`：①登记码 → catalog（带 `{槽位}` 的由 `params` 填，填不满就当这句不存在）②`status===0` → 场景文案 / `appKit.error.network` ③中文界面 → `detail` ④拿不到码（或参数没填上）→ 场景文案 / 按状态码通用句）。`notify.fromError` 每走完 ③ 或 ④ 里那句「按状态码」的兜底，就发一条 `error_fallback source=… status=… code=…` 的 `captureError`（`custom` 通道）——**升不升成 code，看的是这条上报的真实频次**。于是「哪个码重要」不再是 204 句里的一次性猜测，而是被用户实际撞过几次；代价也仍固定四件（Java 常量 / 本表一行 / 两份 `error.json` / `error-keys.ts` 一格），四件由 `ErrorCodeVocabularyTest` 与 `satisfies` 一起核，漏一件就红——升级这条路不缺门禁，缺的是有人定期去读上报。
>
> **两条参数通道（都挂在 ProblemDetail 扩展属性上，都不进 OpenAPI，改它们都不需要 `pnpm gen:sdk`）**。判据是一样的：一句话里那个**必须原样给用户的值**不当句子承载，当数据出一次。两者分工按「有没有字段可定位」分：
>
> - `errors: [{ field, message, value? }]`——**字段级**。`field` 是消费方表单/DTO 的机器字段名（不是中文标签），前端按它定位输入框；`value` 是那条规则作用到的数据本身。边界与 `GlobalExceptionHandler` 里「日志精确到字段，不含实际值」那条口径同源：只放**那一段**（命中的那个词），不放整段用户输入，也不放手机号一类敏感值。前端对边是 `packages/common` 的 `ApiFieldError`，`toApiError` 按声明的三格白名单重建（多出第四格就丢）。后端出口 `BusinessException.badRequest(code, detail, errors)`，首个使用者是 `FORBIDDEN_WORD_HIT`（COM-01：命中的违禁词）。
> - `params: { <槽位>: 标量 }`——**错误级**。没有对应输入框可标红时用（「最多保存 {limit} 条收货地址」里没有“第几个框”），值只收 `string | number | boolean`，对象 / 数组一律丢（没哪句 catalog 句子能插一个对象，且它会顺着上报泄露成第四种形状）。前端对边是 `ApiError.params`（同样白名单重建），catalog 句子的槽位与它的映射写在 `packages/app-kit/src/i18n/error-keys.ts` 的 `CODE_SLOTS`，**两边由 `error-keys.test.ts` 双向核**：句子里长出 `{` 却没登记、登记的槽位在句子里不存在，两边都当场红。后端出口 `BusinessException.badRequestWithParams(code, detail, params)`。
> - 两者的 usage 纪律一样：**`detail` 那句中文仍然写完整**（日志与中文界面兜底靠它），但那句话里的数字 / 词不再由前端解析——中文界面也从 catalog 取（取文案只有一条路，见 i18n.md §7.3）。
> - **槽位没填上不得印裸 `{limit}`**：`formatMessage` 在缺参数时会原样给回模板，所以 `errorTextPlan` 把“填不满”当“这句话不存在”，退回按 locale 的既有兜底（中文 `detail` / 其它语种按状态码的通用句）并由 `notify.fromError` 上报——那是后端漏发参数的信号，不是文案问题。
>
> **已登记的参数化清单（2026-10）**：`ADDRESS_LIMIT_EXCEEDED`（`{limit}`）、`MERCHANT_ADDRESS_LIMIT_EXCEEDED`（`{limit}`）、`FORBIDDEN_WORD_HIT`（走 `errors[].value`，卖家端 `product.publish.forbiddenWordHit`）。**登记在案的「detail 优先例外」已空**——`DETAIL_FIRST` 集合于 2026-10 删除，两条上限码退出后不再有哪个码拿 detail 当文案。退出时顺手改掉的真问题：两份 `error.json` 曾把 20 / 200 **写死**在句子里（后端常量一改，英文界面就在说谎，而“占位句不具体”的注释与文件不符）；现在上限从 `params` 来，后端把 20 改成 30 时前端零改动。**例外清单不再是机制而是历史**——再往后要长出新条目就是绕过参数通道。
>
> **422 校验族的参数通道（2026-10 落地）**：`errors[]` 那一格多带 `rule`（+ `min` / `max`），
> `message` 仍是后端注解上那句成品中文、继续进日志。规则名的唯一出口是 `common.ValidationRules`
> （`REQUIRED` / `MIN_LENGTH` / `MAX_LENGTH` / `PATTERN` / `MIN` / `MAX`），前端那份镜像在
> `packages/common/src/validation-rules.ts`，两边相等由 `ValidationRuleVocabularyTest` 核对。
> 边界由 `infra.web.FieldValidationErrors` 从 DTO 注解读出来（`@Size(max=30)` → `max: 30`），
> 所以**改上限不用改前端**；`message` 那一格不必删——它同时是中文界面的兜底与日志字段。
> **粒度停在「可复用的规则」**：不建 `ORDER_ITEM_QUANTITY_TOO_SMALL` 那种一字段一码的词表，
> 字段名由 `errors[].field` 出、规则名由这张表出，前端拼成句子即可。
> 前端消费口是 `@shop/app-kit` 的 `serverFieldErrorTexts`（出句子）+ `@shop/ui-web` 的
> `applyServerFieldErrors`（交给表单，TanStack Form 自带的服务端校验槽位 `onServer`），各表单不必改渲染代码；
> 提交链路的收口是 `@shop/app-kit` 的 `submitForm`（接住 rejection、只把非接口错误上报监控，见 frontend.md 的模板那条）。
> **认得的 rule 出本地化句子，认不得的退回 `message`**——不在前端猜一句。
> **字段映射是白名单且要列全**：`serverFieldErrorTexts` 给了 `map` 就以它为准（没列出的字段不落进任何框，
> 不回落成同名），同名字段也要列出来——列出来等于「我确认过它同名」，漏列的那条错误就永远落不了地。
> 而**「交给表单」这一步必须用 `setErrorMap({onServer:{fields}})` 而不是手写 `setFieldMeta`**：手写那版
> 在「表单级 validators.onSubmit + 字段自身没有 validator」（本仓库所有表单的形状）下改值清不掉那条错误，
> `isValid`/`canSubmit` 一直为 false，用户改对了也提交不了（实测 form-core 1.33.5）。回归由
> `server-field-errors.test.ts` 的「改值后恢复可提交」那条钉着。
>
> **code 的生命周期与兼容性**（这组规则回答的是「发布之后怎么办」，准入判据回答的是「现在要不要建」）：
>
> - **语义稳定，不复用**：一个已发布的 code 不许改指另一种错误。要表达新原因就新建一个码。
> - **改文案不改 code**：同一原因换句话（含换语种措辞）是纯前端动作，不动后端。
> - **参数是契约的一部分**：删除一个已发布的参数、改它的含义或类型，都要先评估旧客户端——它们会拿旧含义填空。
> - **新增 code 对旧客户端必须安全降级**：旧前端没登记的 code 走既有兜底（中文 `detail` / 其它语种按状态码），不会崩、不会断言语。
> - **忽略未知扩展字段**：服务端可以严格限定自己能发出哪些 code / 参数，**客户端不可以**因为遇到没见过的扩展字段就把整个错误体判为不可解析（`toApiError` 逐格白名单重建就是这个保证）。
>
> **HTTP 状态码的选择依据（定一次，不逐个业务随手选）**：400 请求格式 / 解析 / 约定的非法请求；422 格式可理解但输入校验不通过；409 与资源当前状态冲突；429 限流；5xx 服务端或依赖故障。边界一次定清后不必为形式统一立即改掉旧出口。**状态码不等于可重试**：重试还取决于幂等性、失败发生阶段与有没有 `Retry-After`（下单、支付尤其不能因为一个“看起来可重试”的状态码就自动重放）。
>
> **`detail` 的口径**：本项目约定 **UI 不展示 `detail`**（中文界面那一格是迁移期有意保留的兜底，不是永久设计），但**不能据此推出「它是内部字段」**——RFC 9457 的 detail 是本次错误的可读解释，只要返回浏览器它就是对外信息，SQL / 堆栈 / 密钥 / 内部异常一律留在服务端日志，用已有的 `requestId` 关联（不另开 `traceId`）。
>
> **还欠两件**：
>
> 1. **读上报的那一件**：`error_fallback` 只有发射端，还没有接收端与例行（谁、多久、按什么阈值把一句兜底升成 code）。判据改版把「逐条扫 204 句补码」换成了这条，但它不自动发生——门禁守的是「每个 code 有文案」，**不是**「每句 detail 有 code」，后者的清单今天只在这份普查里数过一次。
> 2. ~~422 校验族参数化 + 表单接线~~ —— **2026-10 已还**：`errors[].rule`（+ `min` / `max`）由后端从注解出，
>    前端 `serverFieldErrorTexts` / `applyServerFieldErrors` 把它落到对应输入框（此前各表单标红全部来自
>    本地 Zod，没有一处消费后端 422 的 `errors`）。剩下的是**推广**：目前只有买家端地址表单接了这条线，
>    其余表单仍是「本地 Zod 标红 + 全局 toast」，逐个接入的顺序按各表单的错误频次定。

四边由 `ErrorCodeVocabularyTest`（无库、不起 Spring、纯文本 + 反射）核对，谁改了任何一边忘了另一边就红：

- **Java 侧**：抛出点不写字面量，一律 `com.shop.platform.common.ErrorCodes.X`（2026-09-30 数：42 处引用 = 37 处带 code 的报错出口（口径见上面普查）+ 5 处在 `BearerTokens` 把码交给 `Verification`，由两个鉴权过滤器转成 401；这三类是码位允许出现的全部形状，长出第四类「码从变量里来」的导管要先过 `CODE_PLUMBING` 白名单那道等式，静态扫不到的码等于不存在）
- **本表**：Code 列 ⇄ Java 常量集合相等；HTTP 列 ⇄ 每一处抛码站点由出口推出的状态码逐处相等
- **TS 侧**：`packages/common/src/error-codes.ts` 的 `ErrorCodes` 键集合 ⇄ 本表 Code 列相等，且每个键的值就是键本身
- **文案侧**：每个 code 在 `zh-CN` 与 `en-US` 的 `error.json` 里**恰有一条** `error.<CODE>`，值非空、无重复键；两份语言的键集合都 ⇄ 本表 Code 列相等。TS 那边另有编译期的一半：`error-keys.ts` 的映射表 `satisfies Record<code, AppKitMessageKey>`，漏一个码就编译不过

「谁在读」这一列**不是声明，是扫描结果**：门禁拿生产前端代码（`apps/*/src`、`packages/*/src`，排除测试与生成物）里真实出现的 `ErrorCodes.X` 引用反查，两个方向都必须相等——某行没写这个文件却有代码在读它，红；写了这个文件而它已经不读，也红。填 `—` 就是「今天没有任何一处按码分支」，这一列存在的理由是把「前端行为」那一栏从**愿望**降级成**可核对的事实**：此前该栏有五行写着按码分叉的动作（字段标红、渲染无权限页、区分过期与无效令牌），实际一处都没有。

| Code                              | HTTP | 谁在读                                      | 前端行为                                                                                                                                                                                                                                                                                                                                 | 后端触发场景                                                                                                                                               |
| --------------------------------- | ---- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SMS_RATE_LIMIT`                  | 429  | `packages/app-kit/src/login-ui.ts`          | 提示失败文案，并同样起 60s 重发倒计时（共享 LoginForm 的发码分支：发码成功、或失败命中此码，都进倒计时）                                                                                                                                                                                                                                 | 同一 IP 或手机号频繁请求验证码                                                                                                                             |
| `SMS_DAILY_LIMIT`                 | 429  | `—`                                         | 不按码分支：429 经全局错误通道 toast 展示 catalog 文案「今日验证码已达上限」                                                                                                                                                                                                                                                             | 同一手机号当日发送量超过日限（20 条）                                                                                                                      |
| `SMS_CODE_EXPIRED`                | 400  | `packages/app-kit/src/login-ui.ts`          | 提示「验证码已失效，请重新获取」，由用户手动重新发码；无自动重取流程                                                                                                                                                                                                                                                                     | 登录或重置密码验证码超时（5 分钟），或输错满 5 次被当场作废（第 5 次错仍报 `SMS_CODE_INVALID`，见下「实现事实补记」）                                      |
| `SMS_CODE_INVALID`                | 400  | `packages/app-kit/src/login-ui.ts`          | 输入框标红，提示「验证码错误」                                                                                                                                                                                                                                                                                                           | 登录或重置密码验证码比对不通过                                                                                                                             |
| `CAPTCHA_REQUIRED`                | 400  | `packages/app-kit/src/login-ui.ts`          | 提示「请先完成图形验证码」，刷新验证码图                                                                                                                                                                                                                                                                                                 | 发码请求（`/auth/sms-code`、`/auth/forgot-password`）带的 captchaId 在服务端查不到答案（两字段必填，缺失/空白在 DTO 就 422，到不了这里）                   |
| `CAPTCHA_EXPIRED`                 | 400  | `packages/app-kit/src/login-ui.ts`          | 提示「图形验证码已过期」，自动刷新验证码图并让用户重输                                                                                                                                                                                                                                                                                   | 图形验证码超时（5 分钟）或已被消费                                                                                                                         |
| `CAPTCHA_INVALID`                 | 400  | `packages/app-kit/src/login-ui.ts`          | 输入框标红，提示「图形验证码错误」，刷新验证码图                                                                                                                                                                                                                                                                                         | 图形验证码比对不通过（输错或大小写不符）                                                                                                                   |
| `TOKEN_EXPIRED`                   | 401  | `—`                                         | 不按码分支：401 一律先试静默续期（`sdk-client` 的 401 拦截只看状态），刷不动才降级为未登录                                                                                                                                                                                                                                               | JWT access token 超过有效期（买家 10 分钟 / 员工 8 小时，见下方「实现事实补记」）                                                                          |
| `INVALID_TOKEN`                   | 401  | `—`                                         | 不按码分支：与 `TOKEN_EXPIRED` 同一待遇（续期一次，失败即未登录）——两者在 401 上无可分辨动作                                                                                                                                                                                                                                             | 未携带 token / 格式无效 / 类型错误 / 受众错误 / 签名校验失败                                                                                               |
| `REFRESH_TOKEN_REUSED`            | 410  | `packages/common/src/sdk-client.ts`         | refresh 拦截器命中此码时 `tokenStore.clear()` 清登录态，410 原样冒泡由全局错误通道 toast 展示 catalog（「所有设备已下线」）                                                                                                                                                                                                              | Refresh token 已被消费过（重放检测）                                                                                                                       |
| `USER_DISABLED`                   | 403  | `—`                                         | 不按码分支：toast 展示 catalog「账号已被禁用，如需恢复请联系平台客服」（客服引导随 §7.3 落进文案）；下单被拦时无额外动作                                                                                                                                                                                                                 | 用户状态非 ACTIVE（登录/刷新，及下单闸门 OrderService.create 经 account::api 查状态）                                                                      |
| `STAFF_DISABLED`                  | 403  | `—`                                         | 不按码分支：toast 展示 catalog「员工账号已被禁用，请联系平台管理员」                                                                                                                                                                                                                                                                     | 平台员工登录时状态非 ACTIVE（StaffService.login）                                                                                                          |
| `PERMISSION_DENIED`               | 403  | `—`                                         | 不按码分支：与其它 403 同一条通道（toast 展示 catalog「没有执行该操作的权限」）；「无权限页」并没有实现，也不引导登录                                                                                                                                                                                                                    | 已认证主体缺少接口所需权限码（PermissionInterceptor 判权失败）                                                                                             |
| `SHOP_NAME_TAKEN`                 | 400  | `—`                                         | 不按码分支：开店/改名表单的 zod 只管长度，撞名由全局通道 toast catalog「店名已被使用，请换一个」；**字段不标红**（后端这一发不带 `errors`）                                                                                                                                                                                              | 开店时店名已被全平台任一店铺占用（ShopService.createShop 预检；并发撞 uk_shops_name 唯一索引兜成同一 400，不看店铺状态）                                   |
| `SHOP_LIMIT_EXCEEDED`             | 400  | `—`                                         | 不按码分支：toast 展示 catalog「每人最多开 1 家店铺」；开店入口没有据此置灰                                                                                                                                                                                                                                                              | 当前用户在 shop.shop_members 已持有 ≥1 条 OWNER 成员记录（一人一店；被拒/被封店铺仍计数，子账号同闸）                                                      |
| `INSUFFICIENT_STOCK`              | 409  | `—`                                         | 不点名具体 SKU：toast 展示 catalog「商品库存不足」，用户自行改数量/移除商品后重新结算                                                                                                                                                                                                                                                    | 下单时条件扣减库存影响行数为 0（预览后商品被抢空）                                                                                                         |
| `COUPON_ALREADY_CLAIMED`          | 409  | `apps/web/src/coupon/coupon.ts`             | 按钮置为"已领取"并提示，不引导重试                                                                                                                                                                                                                                                                                                       | 同一用户重复领取同一张券（每人每模板限领 1 张，唯一索引兜底）                                                                                              |
| `AFTER_SALE_ALREADY_REFUNDED`     | 409  | `—`                                         | 不按码分支：toast 展示 catalog「该订单已退款」（终态，非可恢复冲突，不引导重试）                                                                                                                                                                                                                                                         | 买家申请售后时，该订单最新一张售后单为 REFUNDED（AfterSaleService.apply，V1 整单售后禁止二次退款）                                                         |
| `CATEGORY_NOT_LEAF`               | 400  | `—`                                         | 不按码分支：toast 显示 catalog「请选择三级类目」；发品/编辑页类选择器引导改选三级类目                                                                                                                                                                                                                                                    | 创建商品或草稿改挂类目时，目标类目 level≠3（CategoryService.requireMountableCategory）                                                                     |
| `CATEGORY_DISABLED`               | 400  | `—`                                         | 不按码分支：toast 显示 catalog「该类目或其上级类目已禁用，请另选类目」；引导改选启用类目                                                                                                                                                                                                                                                 | 创建/改挂商品到已禁用类目，或父链上任一祖先禁用（与公开树「父级不可见整支剪掉」同口径）                                                                    |
| `ADDRESS_LIMIT_EXCEEDED`          | 400  | `—`                                         | 不按码分支：toast 显示 catalog（两种语言同一句式），上限数字由 `params.limit` 填（后端把 20 改成 30 时这句跟着变，前端零改动）；参数缺失时退回按 locale 的兜底，不印裸槽位                                                                                                                                                               | 买家新增收货地址时未删地址已达 20 条（AddressService.create；软删不占名额）                                                                                |
| `MERCHANT_ADDRESS_LIMIT_EXCEEDED` | 400  | `—`                                         | 不按码分支：toast 显示 catalog（上限数字由 `params.limit` 填，与买家端同一条通道）；参数缺失时退回按 locale 的兜底                                                                                                                                                                                                                       | 商家新增地址时本店未删地址已达 200 条（MerchantAddressService.create）                                                                                     |
| `BANNER_TIME_RANGE_INVALID`       | 400  | `—`                                         | 不按码分支：两个输入框标红发生在**提交前**的 zod（`banner/form.ts` 的 refine），能漏到后端这一发就是 toast catalog「结束时间必须晚于开始时间」                                                                                                                                                                                           | ContentService.createBanner / updateBanner：起止都给（或 update 时与库中原窗口合并后两端齐全）且 endAt 不晚于 startAt                                      |
| `RESPONSE_VALIDATION_FAILED`      | 2xx  | `packages/common/src/api-error.ts`          | 前端生成错误，非后端返回：dev 完整打印 issues 尽早暴露；生产上报监控，读路径按查询错误状态在**渲染层**降级（错误边界 / 空态），不在 queryFn 里伪造兜底数据；写路径强抛                                                                                                                                                                   | 后端契约漂移——响应 2xx 但 payload 不符合 OpenAPI 契约（前端 zod responseValidator 校验失败）                                                               |
| `FORBIDDEN_WORD_HIT`              | 400  | `apps/seller/src/product/forbidden-word.ts` | **按码分支**（与其他 400 不同的唯一一条）：读 `errors[].field/value`（COM-01 那条参数通道）就地定位到出问题的字段（标题/卖点）并标红，命中词嵌进当前语种的那句（卖家端 `product.publish.forbiddenWordHit`）——只弹一个全局 toast 的话，「含违禁词」四个字卖家无从下手改。拿不到字段级明细时才退成全局 toast，那一发两种语言一律走 catalog | 公开文本命中违禁词：商品发布/重上（ProductService.ensurePublishable）、非草稿商品改标题或卖点（updateBasic）；评价与售后凭证文本 P2 复用同一出口（COM-01） |

## 实现事实补记

- **access token 有效期**：买家 10 分钟（`access-token-expiration: 600000`）、员工 8 小时（`staff-access-token-expiration: 28800000`），见 `apps/server/src/main/resources/application.yml:104-105`。
- **验证码输错计数**（`SmsCodeService`，上限 5 次）：第 5 次输错**当场焚码**（删 Redis 验证码），但**当次响应仍是 `SMS_CODE_INVALID`**；之后再输码才因「无哈希」报 `SMS_CODE_EXPIRED`。重新发码会清尝试计数、重新计数。
- **refresh 并发宽限期**（15s，`RefreshTokenStore`）：已消费的 refresh token 在宽限期内再被消费判为多标签页并发竞争，返回 **401 且无 code**，detail「登录状态正在其他页面刷新，请稍后重试」——前端当普通 401 走即可，勿按重放处理；超出宽限期才判为盗用：全端吊销 + 410 `REFRESH_TOKEN_REUSED`。
- **code 不进 OpenAPI 契约**：`code` 由 `GlobalExceptionHandler` 挂成 RFC 9457 的扩展属性，不出现在 `openapi/api-docs.json` 里，所以改码值或改文案不需要 `pnpm gen:sdk`。（对照：`@Size`/`@Pattern` 那一族数字**是**契约的一部分，动它们必须先起后端重生成——见 `apps/server/AGENTS.md`「入站校验词表」。）
- **抛码站点到状态码的推导**：门禁按出口定状态——`BusinessException.badRequest`/`Validate.isTrue(cond, code, detail)` 恒 400、`forbidden` 恒 403、`conflict` 恒 409、`new BusinessException(int, code, detail)` 用那个字面量、`Verification.fail` 经两个鉴权过滤器一律写 401、`UnauthorizedWriter.write` 用它自己的 int 参数。`Verification.fail` 的那条链是推出来的而不是写死的：门禁同时要求「读 `verification.code()` 的文件必须正是以 401 调 `UnauthorizedWriter.write` 的那两个过滤器」，否则 401 这个默认值就悬空了。

## 设计原则

- **code 不是 HTTP status 的复述**：`RESOURCE_NOT_FOUND` / `FORBIDDEN` 不加。判据改了两版，这一条都没被推翻：404/403 的用户可见文案由状态码那条通道自己出（404 页、错误边界、未登录跳转；非中文界面还有 `appKit.error.*` 那九条通用句），不走 `error.<CODE>`——给它们补码只会多一条没人读的键，上面普查里那 78 处 404 出口就是这种情况，它们不需要码，需要的是那句通用话
- **code 不是 debug 信息**：`AUTH_PASSWORD_TOO_SHORT` / `VALIDATION_ERROR` 不加，被前端校验拦截或由 422 的 `errors` 列表承载。注意 422 那一族的文案**现在仍在后端**（成品中文句子，未参数化），它是上面「还欠两件」的第 2 件
- **code 不预设未来场景**：只在当前有明确区分需求时加；但 §7.3 之后这条的约束力弱了一档——码一旦有了 catalog 文案，它就同时是**文案的键**，删码等于删一句用户看得见的中文，所以退码要连着删两份 `error.json` 与 `error-keys.ts` 那格
- **上面这些仍然没人守着，只有本表四边相等是机器查的**：`TOKEN_EXPIRED` 与 `INVALID_TOKEN` 同为 401 且前端动作完全相同，按第一条就该只有一个（或都不该有）——它们留着是因为诊断上有用（日志里分得清是过期还是签名错），而 catalog 现在给两者各有一句（「登录已过期，请重新登录」/「登录状态无效，请重新登录」），文案差异恰好就是这个诊断差异的面向用户的版本。这一格账记在这里，等真有前端要按码分叉时再收。
