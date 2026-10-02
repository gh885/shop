# 前端规范（web / seller / admin + 共享包）

> 写前端代码前的必读细则；根 [AGENTS.md](../../AGENTS.md) 只留铁律摘要。
> 本文件的取数条款**想修改前先读**论证与教训：[query-convergence.md](query-convergence.md)。
> 视觉规则与组件生成不在本文：[packages/ui-web/DESIGN.md](../../packages/ui-web/DESIGN.md)。

## App 内目录结构（web/seller/admin 通用）

- 顶层只有五种形态：`app/ layout/ routes/ shared/ {domain}/` + 入口文件（main/router/styles/routeTree.gen）；`widgets/`、`features/`、`components/`、`lib/` 等旧分类法不再新增
- `app/` 应用装配：Provider 树、全局单例、bootstrap 等基建；不写业务逻辑与 UI 壳
- `layout/` 平台骨架：导航、页脚、进度条等无业务语义的壳；带业务数据的进 domain
- `{domain}/` 目录名 = **本端路由顶层业务段**（去参数段与叶子页）：web `/products/$id` → `products/`、seller `/product/*` → `product/`；各端机械映射优先于跨端统一命名
- domain 内「文件名即分层」：`xxx.ts` 逻辑层 / `queries.ts` 数据层 / `use-*.ts` hook / `constants.ts` 展示常量 / 组件平铺（组件多则开 `components/` 或按路由子目录）；有自己要管的数据和状态的才配叫 domain，纯展示页组件直接写薄在 routes/
    - **「这一页」归路由文件，域里放的是零件**：路由的 `component` 就是页面编排者——读 URL 状态（`Route.useSearch()` / `Route.useNavigate()`）、取数、挂 mutation，再把 `queries.ts` / `columns.tsx` / `filters.tsx` / `xxx-dialog.tsx` / `use-*.ts` 组起来。反过来的形状（域里一个与某条路由 1:1 的页面组件 + 路由里一个只递 `search`/`navigate` 的薄壳）是负资产：多一个文件、页面逻辑劈成两半，还要在手抄的 `(options: { search: S }) => void` 里丢掉真实 navigate 的能力（`search: prev => …`、`replace`）。写回 URL 的动作形状统一用 `SearchNavigate<S>`（admin 在 `shared/ui/paged-list-shell.tsx` 导出），不在各域里各抄一份
    - **域里那个页面组件什么时候合法**：两种，都不是「页面」。(1) 被**多条路由**复用的外壳——`cms/list-shell.tsx` 一份外壳服务 banner / nav / recommend-tab 三条路由，页体仍各自写在路由里；(2) 不碰 URL 状态的**组合根**——`category/page.tsx`、`shipping/ShippingTemplatePage.tsx` 直接作为 `component` 挂上，没有 `search`/`navigate` 要递，组件自己就是编排者。这种场合再包一层路由文件只递 `component` 是纯噪声（判据：薄壳除了转发参数以外一行逻辑都没有 → 别包）
    - `constants.ts`：**展示文案 / 色板 / 动作表 / 页签**（纯数据，不 import 组件）。同一张表被 ≥2 个组件消费时必须收敛到这里——文案散在组件里必然漂移（同一个状态在卡上叫「交易成功」、在页签叫「已完成」）；规则（判定逻辑）仍留在 `xxx.ts`
    - **页签 / 下拉选项不是第二张表**：用 `@shop/common` 的 `statusOptions(表[, order])` 从状态表派生，一个状态只有一处中文（徽章与页签各写一份时「上架中」会漂移成「在售」）；文案与徽章色同表时合并成一张 `XXX_STATUS_META`（`{ label, variant }`），不设平行表——平行表要求每次加状态改两处，漏一处就得到「新状态没颜色」
    - 只有**角色措辞真的不同**时才各写一份（买家「待卖家处理」/卖家「待处理」是同一状态对两个人说两句活），并在表头注释写明这是决定而不是漏同步
- **文件名两种 case，各说一件事**：名字是**槽位**（这个文件在域里占哪个位置，换域就换含义）→ kebab-case：`queries.ts` / `model.ts` / `constants.ts` / `columns.tsx` / `filters.tsx` / `form-dialog.tsx` / `use-*.ts`；名字是**专名**（拿出来就是一个完整概念，`OrderCard.tsx` 放哪个 app 都还是它）→ PascalCase。入口与路由保持小写（`main.tsx` / `router.tsx` / `index.ts`；`routes/**` 由 TanStack Router 的文件约定决定，不归本规则）。判据一句话：**把文件挪去别的域，名字还成立吗**——成立的是专名，不成立的是槽位
    - **目录已经说出概念时，文件名不重复念一遍**：`coupon/CouponTable.tsx` 读出来是「coupon coupon」，该写 `coupon/table.tsx`——它本来就是「这个域的表格」这个槽位。这是迁移方向，存量不批量改名（改名污染 blame，也让 `fallow audit` 的 new-only 归属把整文件当成新代码）
    - 现状是**按端分裂**的：admin 全端零 PascalCase（组件名一律折成 kebab，`attr-panel.tsx` 导出 `AttrPanel`），web 约三分之一、seller 约四分之一的文件走 Pascal。所以 `unicorn/filename-case` 保持 `off`，别指望用 lint 收敛：一个 case 设置表达不了两级约定（选 kebab 把 web 的组件全判违规，选 pascal 把 admin 全判违规），而 per-directory 的 `--deny` override 也切不开**同一目录内**混住的 `queries.ts` 与 `OrderCard.tsx`（web/seller 每个域都是这个形状）。这条靠 review 时问一句「槽位还是专名」，不靠一条会红三百次的规则——那种规则等于没规则
- 依赖方向：`routes → domain → shared`；shared 不 import domain；domain 之间只经对方 `index.ts` 公开入口；跨端通用逻辑下沉共享包 —— 生成 SDK 在 `packages/api`，手写共享逻辑一律归 `packages/common`，**禁止在 `@shop/api` 内新增手写文件**。`packages/common` 与 `packages/app-kit` 内部按切片走子路径 exports（没有根 barrel，import 上写明依赖哪片）：切片地图与准入标准见各自 `README.md`
    - 这条已由 `fallow` 的 boundaries 机械拦截（`pnpm fallow`，zone 配置在 `.fallowrc.json`）：`index.ts` 单独成 zone，所以绕到对方 `queries.ts` / `model.ts` 会直接判 boundary-violation。要给跨域用的符号（如失效缓存要的 query key）就得进 barrel——「只暴露外部真正消费的那几个」里的"外部"包含别的域
- hook 上提标准：≥2 个组件复用或状态机复杂才抽成 `use-*.ts`；域内 hook 留在域内，不因"它是 hook"进 shared
- **领域类型不镜像 SDK**：wire→领域投影只在有真实变换时才写（改名 / 可空归一 / 枚举大小写映射 / 兜底占位）；契约字段同名同型透传的，直接用 `@shop/api` 的生成类型，不造 `Xxx` + `toXxx` 恒等复制。扩展形状优先 `Order & Omit<OrderDetailResponse, "status" | "items">` 这类组合，不逐字段抄书
- **组件 props 用多少声明多少**：不直接把数据层宽实体（OrderDetail 等）整个当 prop 类型，用 `Pick` 声明渲染所需切片（结构类型下调用方传整体零成本）；回调不回传父组件已持有的实体（如 `onAction(action)` 而非 `onAction(order, action)`）。例外：职责就是渲染实体大部分信息的卡片（OrderSummaryCard 用 ~20/30 字段）与页面编排者，宽类型正当

## App 接入 ui-web（如 apps/web）

组件库构成：**shadcn/ui + BaseUI（`@base-ui/react`，WAI-ARIA 合规）+ Tailwind v4 分层主题 token**（数值真相源 `packages/ui-web/src/styles.css`）；图标库 `lucide-react`；组件由 CLI 生成到 `packages/ui-web`（命令见 DESIGN.md），导出经 `packages/ui-web/src/index.ts` 供各 app 直接 import。

- 样式入口只需 `@import '@shop/ui-web/src/styles.css'`（内含 tailwindcss 与主题变量，不要重复 import tailwindcss）
- **每个「写了 Tailwind 类名、又位于 app 目录之外」的包都要 `@source`**：目前是
  `@source '../../../packages/ui-web/src'` 与 `@source '../../../packages/app-kit/src'`。
  Tailwind v4 内容探测不覆盖 app 目录之外的包；漏声明的失败模式是**静默掉样式**（不报错、不 warning，
  构建照过、单测照过，只有肉眼看页面才发现控件没了圆角/内边距）。往这两个包加带样式的组件时，
  先确认三端 `styles.css` 都已声明；给 app-kit 新增带类名的组件同样要检查 app-kit 是否已声明
- API 请求走 Vite proxy 同源（web 的 key 集：`/auth`、`/api`、`/user`、`/cart/`、`/payments`、`/favorites`、`/coupons/`、`/reviews` → `localhost:8080`；`/orders` 刻意不进静态代理，由 `ordersApiProxy` 中间件按 Accept 头分流，因为页面 `/orders/$orderId` 与 API `GET /orders/{id}` 同路径），浏览器端 baseUrl 用空串；SSR loader 里需绝对地址。尾斜杠与不带尾斜杠是两种有意的形状：`/cart/`、`/coupons/` 因为有同名页面路由（`/cart`、券包页在 `/account/coupons`），`/favorites`、`/reviews` 因为 API 会调裸前缀路径。加新前缀时先问「有没有同名页面路由」，答错是整页 401，不是接口 404
- 登录态：`apps/web/src/shared/api/auth.ts`（access token 只存内存，refresh token 走后端 httpOnly cookie）
- 启动时 `bootstrapAuth()` 静默刷新（`shared/api/client.ts`），root 布局挂载处调用；受保护路由用 `beforeLoad: () => requireAuth()` 守卫，未登录自动拉起全局登录 Dialog
- 用户信息：`useMe()`（web 在 `account/queries.ts`、seller/admin 在 `shared/lib/me.ts`，三者都由 `@shop/app-kit` 的 `createMeQuery` 生成，未登录不发请求）
- 表单字段只放**用户输入的事实**：能从已填字段推出来的列不进表单。地址的省市区名就是这一类——表单只有 `regionCode`，三级名在 mutation 里按区划库现查（`packages/common/src/domain/address.ts` 的 `regionNamesByCode`，口径见 ACC-81），级联字段 `RegionField`（`@shop/app-kit`）收和交也都只有这一个码。存两份的代价不是那三行 `setFieldValue`，是「界面看到的」与「落库的」各有权威、迟早分家
- 表单：用 `useAppForm`（`@shop/ui-web`，TanStack Form + Zod validators），不手写裸 state 表单。周边一并统一：校验放表单级 `validators.onSubmit`（不用字段级 onChange）；提交接线 `onSubmit={(e) => { e.preventDefault(); void submitForm(form) }}`（`submitForm` 来自 `@shop/app-kit`）——**不写 `void form.handleSubmit()`**：void 只丢返回值、不接 rejection，`onSubmit` 抛出的错误会变成未处理的异步异常。`onSubmit` 内部该抛就抛（框架才把 `isSubmitSuccessful` 置回 false），`submitForm` 接住它并把「非接口错误」上报监控。**不要在 `onSubmit` 里 `catch {}` 了事**：那会把「代码坏了」那一类也静默吞掉，用户看到的是「点了提交什么都没发生」、监控里也没有记录。2026-10 三端表单与 `@shop/app-kit` 的共享表单（登录、`ReasonForm`）已全部收口，仓库里不再有内联 `void form.handleSubmit()`（只有说明为什么不用它的那几句注释）；服务端/表单级错误用 `<FormError>`；弹窗表单体挂在 `DialogContent` 里（关闭即卸载、打开即按 props 重算默认值，不写 effect + `form.reset`）；页脚用 `DialogFooter`，取消按钮 `variant="outline"`，提交按钮 `{pending && <Spinner />}文字`、pending 读 mutation 的 `isPending`；弹窗内字段竖排、整页表单 label 左列（`orientation="horizontal"`）
- 后端 422 的**字段级**那一句落回框上只有这一条路：`applyServerFieldErrors(form, serverFieldErrorTexts(error, locale, map))`，然后 `throw error`（交给 `submitForm`）。`map` 是「DTO 字段名 → 表单字段名」的**白名单**——没列的不落框（仍由全局 toast 讲），同名字段也要显式列；没有输入框的路径刻意不列（`Money` 是 `amount`+`currency` 一对列、界面上没有那一个框，落哪个都错）。数组路径认（key 就是注册字段名 `rows[1].priceText`），但**服务端下标不一定等于行号**：请求体按投影生成（库存模式丢掉未定价的行），map 要跟着投影算下标，见 `EditSkuDialog.tsx` 的 `skuServerFieldMap`——落错框比不落框糟，用户会去改一个没错的规格。不写 `setFieldMeta` 手写 `errorMap.onServer`：实测 1.33.5 在「表单级 validators + 字段无 validator」那个组合下改值清不掉它，`isValid` 永久 false，**用户改对了也提交不了**（回归用例在 `server-field-errors.test.tsx`）。
  弹窗要用这条通道还有个前置条件：**失败不关窗**——`onConfirm`/`onShip` 返回 promise、`await` 完再关，先关等于把表单一起卸载、那句话用户看不见。行内动作的 `useRowBusy.run()` 已把动作的 promise 原样透出（复位由兜底分支负责，所以发射即忘的调用点不会漏出 unhandledRejection）。

## 状态归属（前端）

原则：**状态在哪里产生（最先可观测），就在最近的消费者处理它**。可观测点由取数机制决定，不机械绑定组件层级：

- query hook → **失败交给错误边界，挂起就地渲染**：`throwOnError` 已是全局默认，页面主体数据失败由路由 `errorComponent` 接管，区块失败由 `QueryBoundary` 接管（见「错误与重试」）；只有**头上没有边界可接的查询**（页头角标、收藏心形、弹窗/向导内部件，或消费方本就写「拿不到就不画」的附属区块）才显式 `throwOnError: false` 并在组件里渲染 `isError`
- 派生态（如 empty：`data.length === 0`）→ 派生它的那一行所在组件
- mutation 错误 → 全局 `MutationCache` 按 `meta.error` 提示（渲染点在根部，已是产生点最近的消费者）；乐观态 → 缓存 patch 层（`optimisticListMutationOptions`），列表行只读缓存
- 组件内部瞬时状态（上传进度/提交中按钮）→ 留在组件内；出现第二个消费者才上提为域内 `use-*.ts`（与 hook 上提规则同构）
- route loader / `useSuspenseQuery` → 状态上移到 `pendingComponent`/`errorComponent`/Suspense 边界，父组件不再接触 query

分界线：往子组件传**状态标志**（`isPending`/`error` props）= 放错位置的味道——子组件被迫认识"状态是什么"，还会长出可空 props；传**处理后的结果**（`deriveXxx` 视图模型、骨架屏或数据二选一）= 干净——子组件只管"拿到什么画什么"。

## 服务端状态：query 的收敛口径

前提：TanStack Query 已是唯一的服务端状态通道（三端全量接入，loader 一律经 Query 缓存取数，没有裸 fetch）。条款的完整论证、历史教训与库机制依据见 [query-convergence.md](query-convergence.md)——**想修改以下任何一条，先读那篇**。

### 进不进 query：只有一条判据

**这份数据是否是需要保持一致的服务端副本**（会被写操作/别人改动，且有多处读或需跨路由留存）。

- 是 → 进 query。**不要**用 `useState`/zustand 存服务端实体。区分**实体**与**实体之上的编辑会话**：表单行草稿必须本地 state（草稿是唯一事实源），但实体详情本身必须来自 query。
- 否 → 走 api/SDK 裸调或 mutation。典型：文件导出/下载、验证码、一次性提交（登录、反馈）。
- **判据是「缓存这份数据有没有收益」**：陈旧值比转圈更糟、副作用不可缓存、一次性会话、体积大不该进缓存——这四类即使是服务端数据也不进 query。
- **404 不是「不进 query」的理由**：已有「无数据」合法 UI 表达时用 query + `retry: false`；只有调用方要把 404 折叠成"没有"时才在 `queryFn` 里归一为 `null`。
- **写操作一律有接线**（全局反馈 + `meta` 声明），但**不是每个写操作都需要失效**：`meta.invalidates` 不传 = 显式声明"不改变任何已缓存查询"，不是漏写。

### 放哪个文件：key 归属 = 域，集中在域内 `queries.ts`

- **key 工厂集中在域内 `queries.ts`**（`productKeys` / `couponKeys` / `reviewKeys`…），一个域一棵树。
- **失效规则写在 mutation 旁边**（谁改数据，谁声明影响范围），不写在调用点。跨域连带失效也归进 mutation（下单后失效购物车 + 角标 + 我的订单）。
- **三端同形态的查询用 app-kit 的工厂，别复制**：`createAppQueryClient()`（默认值唯一真相源）、`createMeQuery()`、`MutationMeta`。新增"三端都会写"的查询时，先问能不能把它变成工厂参数。
- **不造第二棵 key 树**：同一份服务端数据有两个 key = 两份缓存 + 两处失效，必然漂移。发现即合并成一个 `xxxKeys`。
- **不用 `refetch()` 当刷新**：刷新（数据变了）走 `invalidateQueries`（在 mutation 里）；**错误态重试**是另一回事（见「错误与重试」）——两套语义不要混。
- **loader 预取写 `queryClient.query({ ...options, staleTime: "static" })`，不用 `ensureQueryData`**（后者 5.102 已废弃；机制论证见 query-convergence.md §2）。
- 领域组件（弹窗/卡片）**不 import query key**：只通过 `onSaved` 这类回调通知外层"数据变了"，由域内决定失效范围。回调名说"发生了什么"，不说"去做什么"（`onSaved` 而非 `invalidateList`）。
- **组件直接 `useQuery(xxxOptions)`，不给每个查询再包一层同名 hook**（恒等透传只是起第二个名字）。
- **hook 只在携带决策时存在**。判定线：options 负责「取什么」，hook 负责「怎么用」，至少命中一条才值得包——
    - 叠 `enabled`（登录态 gating）：`useCartCount` / `useFavoriteStatus`
    - 派生/编排视图模型（多个 query + mutation + 导航/URL 状态合成一个给页面用的口）：`useOrderList` / `useProductList` / `useCartItemActions` / `useOrderActions` / `useCurrentShop` / `useLeafPaths`
    - 跨端同形态的写操作接线：`createMeQuery`
    - （换变体不算——调用点直接写 `useSuspenseQuery(feedOptions)` 更显眼）
- **写操作不包 hook 工厂**：一律用库自己的 `useMutation`，反馈与失效经 `meta` 声明，由全局执行（见下节）。
- **lint 兜底**：官方 `@tanstack/eslint-plugin-query` / `-router` 经 oxlint 的 `jsPlugins` 加载（oxlint 由 Vite+ 内置，不单独装），配置与逐条理由见 `packages/config/oxlint.config.ts`——它是**被根 `vite.config.ts` 的 `lint` 块消费的对象**，不是独立可跑的配置文件。

### 写操作：反馈与失效走官方 meta 通道，不包 hook 工厂

**一句话**：写操作一律写库自己的 `useMutation`，反馈（提示）与后果（失效）通过**官方的 `meta` 通道**声明，由 `createAppQueryClient()` 里的全局 `MutationCache` 一次执行。

```ts
useMutation({
    mutationFn: (orderId: string) => OrdersApi.cancelOrder({ path: { id: orderId } }),
    // 依赖变量的失效用库自己的 onSuccess（第 2 参即 variables，第 4 参带 client）
    onSuccess: (_data, orderId, _ctx, { client }) =>
        void client.invalidateQueries({ queryKey: [...ORDER_DETAIL_KEY, orderId] }),
    meta: { success: "订单已取消", error: "取消订单失败", invalidates: [MY_ORDERS_KEY] },
})
```

为什么是这个形态（官方刻意不表态失效、全局回调先于逐点、不做 `useWriteMutation` 工厂的完整论证）见 query-convergence.md §3。

`MutationMeta` 只有四个字段（`packages/app-kit/src/data/mutation-meta.ts`）：

| 字段          | 作用                                                           | 缺省行为                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `success`     | 成功提示文案                                                   | **不填即不提示**（「要不要提示」由有/无承载，所以没有 `silentSuccess`）                                                                                                                                                                                                                                                                                                               |
| `error`       | 失败兜底文案                                                   | 命中 code 时弹 catalog 那句（i18n.md §7.3），轮不到它；它只在「拿不到响应**且没有码**」时顶上（`status === 0` 且非 SDK 拦截器产生的错误），没给则退 `appKit.error.network`。断网 / 超时 / 取消三族现在**有码**（`packages/common/src/contract/client-failure.ts`），走 catalog，不再落到这一格。未登记 code 的错误：中文界面显后端 `detail`，其它语种按状态码取 `appKit.error.*` 那句 |
| `silentError` | 该写操作自己渲染/吞掉错误（表单内联报错、会话终结）            | 一律弹全局失败提示                                                                                                                                                                                                                                                                                                                                                                    |
| `invalidates` | 这份回执让哪些查询失效（**真实 query key**，前缀匹配一发命中） | 不失效任何缓存                                                                                                                                                                                                                                                                                                                                                                        |

写新写操作时的四条硬规矩：

1. **`invalidates` 传真实 query key，不要发明 tag**：tag 表等于在 query key 之外再造一棵命名树，新增读取方时没人会记得补 tag（与「不造第二棵 key 树」同一条理由）；而且它表达不了「由变量算出的 key」——那种情况用库自己的 `onSuccess`。
2. **`silentError` 是显式声明，不是逃生舱**：只有「错误已经在别处被用户看见了」才用它（表单把错误渲染在字段下——渲染的那句要经 `errorText`（`@shop/app-kit`，§7.3 那条链），不要自己读 `err.detail`；后端把裁定落在具体字段上时读 `err.errors`（`ApiFieldError`：`{ field, message, value? }`，`toApiError` 归一化时接回），按 `field` 标红那一个输入框、把 `value` 嵌进当前语种的那句——范本是 `apps/seller/src/product/forbidden-word.ts` + `routes/_app/product/create/basic.tsx`，**不许从中文 `detail` 里正则捞字段名**；登出后本地身份已清且人已在登录页）。
3. **乐观更新写 `useMutation(optimisticListMutationOptions({ ... }))`**：官方那三步（`onMutate` 取消在途 → 快照 → patch；`onError` 回滚；`onSettled` 失效）顺序写反了只在并发下偶发出错，所以固定在一次实现里，只把「怎么 patch」交给领域；反馈不在它里面（全局负责）。
4. **危险操作的二次确认走全局 `confirm()`（`@shop/ui-web`）**：`const ok = await confirm({ title, description, confirmText, action })`，与 `notify` 同级的全局收口——调用点不再持 `open` state、不铺弹窗骨架，根布局只挂一份 `<ConfirmDialogHost />`（与 `<Toaster />` 并排）。`action` 传 `mutation.mutateAsync(...)`：promise 期间确认按钮转圈，成功关面，失败保持打开等重试（错误提示已由全局 mutation 反馈弹过，这里不重复）。只在客户端事件回调里调，不要在渲染期/SSR 阶段调。**表单页的「未保存离开」守卫不自己拼 `useBlocker` + 弹窗**：用 `useUnsavedLeaveGuard(when, { beforeUnload, onLeave })`（`@shop/app-kit`），它把路由拦截、关页/刷新兜底和这同一个确认面一次接好。

### 错误与重试：全部走官方边界，不自造 onRetry

**一句话**：失败态交给「谁渲染这一块」对应的官方边界，重试由边界的官方 reset 完成；`invalidateQueries` 只用于 mutation 之后的刷新，不再兼任重试。

`throwOnError: throwWhenNoData` 是 `createAppQueryClient()` 的**全局默认**，所以「失败抛给边界」是常态、不必逐条声明；**需要显式写的是退出**（`throwOnError: false`）。机制依据见 query-convergence.md §4。

| 失败范围                                                          | 交给谁                                            | 怎么接                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面主体数据（详情 / 列表 / 结算 / 收银台 / 工作台 / 店铺守卫）   | 路由 `errorComponent`                             | 什么都不用写：全局默认把错误抛给该 match 的 `CatchBoundary`，由三端 router 的 `defaultErrorComponent`（`RouteErrorFallback`）渲染；重试 = Router `reset()` + `QueryErrorResetBoundary.reset()`                                         |
| 区块 / 弹窗内部件（店条、推荐流、首页 feed）                      | `QueryBoundary`（`@shop/app-kit`）                | 期望「整块替换」的用它：`pending` 骨架 + `fallback`（字符串 = 默认 `StateError` 错误态 + 官方 reset 重试；函数 = 自定义布局的失败态）；suspense 查询自己会抛，非 suspense 查询靠全局默认抛到它的 `ErrorBoundary`（此时别传 `pending`） |
| 无边界可接的附属件（页头角标、收藏心形、可领券、弹窗/向导内部件） | 就地错误态                                        | options 写 **`throwOnError: false`** 退出全局默认，失败就地渲染 `isError` 并用官方 `refetch()` 重试（官方 manual 写法）                                                                                                                |
| 挂起                                                              | `pendingComponent` / `QueryBoundary` 的 `pending` | 路由级 `pendingComponent` 会被 Router 兼作该 match 的 Suspense fallback（见 `@tanstack/react-router` 的 `Match.js`），同时覆盖 loader 与 suspense 查询                                                                                 |

写新查询时的五条硬规矩（完整机制依据见 query-convergence.md §4）：

1. **该抛才抛**（这条已内建为全局默认，别改成 `true`）：直接写 `true` 会在「有旧数据的后台刷新失败」时把一屏能看的内容换成整页错误页。
2. **退出默认的唯一判据是「头上有没有边界」**，不是「这份数据重不重要」。页头角标、收藏心形、可领券入口，以及消费方本就写「拿不到就不画这一块」的附属区块，都必须写 `throwOnError: false`——否则一个小挂件失败就炸掉整页。清单在各 options 的注释里。
3. **`enabled` / `placeholderData` / `skipToken` 与 suspense 互斥**：这类查询挂不了 `pending`，但仍然可以抛给一个不传 `pending` 的 `QueryBoundary`，或抛给路由 `errorComponent`。只有当它同时也没有边界时，才落回第 2 条的 `throwOnError: false` + `refetch()`。
4. **`useSuspenseQuery` 收不到 `throwOnError`**（类型里被 `Omit`，运行时被内部判据覆盖）：降级消费者要退出全局默认时，**必须在调用点写** `useQuery({ ...options, throwOnError: false })`，写在共享 options 里是静默失效。
5. **`QueryErrorResetBoundary` 必须在树里**（三端 Provider 树已挂，`QueryBoundary` 自带一层），否则重试按钮形同虚设。

### 挂起（pending）：路由级 `pendingComponent` 与区块级 `QueryBoundary` 各管一段

挂起分两段，**由谁来填取决于那段里跑的是什么形态的查询**——先分清形态，再选组件，否则要么写了死代码，要么留了空窗。

**第一段：路由 match 级（loader 还在跑 / 页面顶层 suspense 查询还没到）**

- **需要 `pendingComponent` 的路由只有一种：loader 里 `await` 了取数，或页面顶层是 `useSuspenseQuery`（含 infinite）**。这类路由在 match 级真的会挂起，Router 拿 `pendingComponent` 兼作该 match 的 Suspense fallback（见 `@tanstack/react-router` 的 `Match.js`），一次覆盖 loader 与 suspense 查询。骨架按该页真实形状写在路由文件里。
- **其余路由不写 `pendingComponent` 是对的**（不是遗漏）：纯 `useQuery` 的页面在 loader 跑完、组件挂载后才取数，match 级不挂起；预热型 loader（`void queryClient.query(...)` 不 `await`）同理。见 §「什么时候不需要 pendingComponent」。

**第二段：区块级（页面已渲染，某个区块的 suspense 查询还在飞）**

- 用 `QueryBoundary pending={<骨架/>} fallback={...}`：`pending` 只对 **suspense 查询**生效——`QueryBoundary` 内部是 `pending !== undefined ? <Suspense fallback={pending}>{children}</Suspense> : children`（见 `@shop/app-kit` `query-boundary.tsx`），非 suspense 查询不会 suspend，传 `pending` 是**死代码**。
- **非 suspense 的区块查询（带 `enabled`/`placeholderData`/`skipToken` 的按需/降级读）根本没有「区块级挂起」这回事**：它在组件挂载后自己跑，要占位只能在调用点写 `isPending ? <骨架/> : <内容/>`，或者干脆不传 `pending` 让它失败抛给同一个 `QueryBoundary` 的 `ErrorBoundary`。本仓 6 处 `QueryBoundary pending=`（首页 feed/banner/nav、详情页店条/两处推荐）包的都是 suspense 查询，无例外。

**为什么这两段不能互相替代**：路由 `pendingComponent` 是**整个 match** 换骨架（父级布局仍在，叶子内容整块换）；`QueryBoundary` 是**块级替换**（页面其余部分照常渲染）。作用域不同，一个页面可以同时有：路由 `pendingComponent`（首屏）+ 若干 `QueryBoundary`（各区块各自的三态）。

**第三种：守卫层骨架（别当成「应该用 pendingComponent」的错例去修）**

布局路由里的**守卫组件**自己渲染整页骨架，等的不是 loader，而是**一个前置条件裁决**：seller 的 `ShopGate`（店铺上下文）、web 的 `_protected/route.tsx`（登录态 `unknown`）。它既不是 match 挂起（match 已就绪），也不是区块边界，而是「等完还要分支」：

- 三个分支都要有（骨架 / 放行 / 重定向），`pendingComponent` 表达不了「等完还要分支」；
- 守卫是 layout 的 `component`，需要路由上下文（`useLocation` / `useNavigate` / 重定向目标），塞进 `pendingComponent` 会丢这些；
- 作用域正好是「比match 小、比区块大」，即 layout 组件的自然位置。

写法要点：**骨架不能省，也不能替成分支**。`ShopGate` 的注释已给出理由——`useMyShops` 首次渲染必是空，直接判「无店 → 重定向」会先闪一下再跳走；`ProtectedLayout` 返回 `undefined` 则会让 SSR 吐一个空 `<main>`（白屏 + CLS 来源），所以 `unknown` 期间必须给骨架（frontend.md 的「守卫 → 骨架」即此）。

### 什么时候不需要 `pendingComponent`（附：挂起的时间语义）

- **`pendingMs` 门槛**：`defaultPendingMs = 1000`（router-core 的默认值，未覆盖），挂起**超过 1s** 才呈现骨架；快请求本来就无感。所以路由级骨架只在慢请求时出现，这是想要的行为（避免快请求闪一下）。
- **页内三元是「立刻闪」**：调用点 `isPending ? <骨架/> : …` 在挂载首帧就闪，与路由级「1s 后才出现」的时间语义不同。两者观感不一致是库的既定行为，不是 bug；要统一观感得先决定「快请求要不要骨架」（本仓选择保留差异：首屏/导航快速命中时不闪更好）。
- **三端 router 已挂 `defaultPendingComponent`（`RoutePending`，app-kit）作为兜底**：某个路由漏写 `pendingComponent` 时，客户端导航期间旧页会继续停留（库对没有 pendingComponent 的 match 渲染 null，不会白屏，但整个挂起窗口零加载反馈）——有它就把「静默停留」降级成中性骨架。它只在**没写**时出现，页面级骨架仍应各自按真实形状写。
- **`isPending` 与 `isLoading` 不能互换（v5 语义）**：`isLoading = isPending && isFetching`（只表示「首次加载」）。两条边界：
    - **`placeholderData` 页面两者等价**：换页时 `placeholderData` 顶着，`isPending` 与 `isLoading` 同为 false，都不闪骨架——所以本仓列表页统一用 `isPending`（DESIGN.md 口径）。
    - **`enabled` 可为 false 的查询只能用 `isLoading`**：`enabled:false` 时 `status` 恒为 `pending` → `isPending` **永远 true**，用它分支就是一块**永久骨架**。这类查询（`enabled` 由登录态/开关/入参决定）判「在加载」用 `isLoading`，或直接判 `data === undefined`；例：`seller/shop/list.tsx` 的 `useMyShops`（`enabled: status === "authed"`）、`search` 页的 `enabled: hasSearchCriteria`。

## 金额（Money）

**一句话**：`Money { amount(分), currency }` 是链路上唯一的金额形状，「元」只活在输入框和展示文本里；运算和展示都不许脱离 Money，否则币种在那一刻就丢了。

| 要做的事            | 用什么（都在 `@shop/common` 的 `money.ts`）                                        | 不要                               |
| ------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- |
| 展示一笔钱          | `formatMoney(m, locale, placeholder?)` / 共享 `Price` 组件（分段排版，符号跟币种） | 各处手写 `¥${fenToYuan(m.amount)}` |
| 加减乘件数求和      | `plusMoney` / `timesMoney` / `sumMoney`（跨币种抛错，不静默相加）                  | `.amount` 抠出来做算术             |
| 表单回填            | `moneyToYuan(m)`（无符号、不分组、补齐两位）                                       | 拿 `formatMoney` 的结果塞进 input  |
| 元输入 → Money      | `yuanToMoney` / `yuanPriceSchema`（币种默认平台定价币种 CNY）                      | 自己 `Number(v) * 100`             |
| 判两笔钱是否同一笔  | `sameMoney`（Money 是值对象，`===` 比的是引用）                                    | `a.price !== b.price`              |
| 比大小 / 取最低最高 | `compareMoney` / `minMoney` / `maxMoney`（跨币种抛错，空集合给 undefined）         | `.amount < .amount`、自己写 reduce |
| 判这笔钱有没有值    | `isPositiveMoney`（优惠为 0、门槛为 0 都是「没有这一项」）                         | `m.amount > 0`                     |
| 划线价该不该画      | `strikethroughPrice(original, price)`（等于成交价就是不打折）                      | 每个渲染点各判一次大小             |

- 缺席的钱显式给占位符（`formatMoney(undefined, locale)` → `—`）：`¥0.00` 和「没有数」是两件事，前者会被读成免单。
- 造零值不凭空预设币种：`sumMoney` 非空时起点币种跟第一笔钱，`zeroMoney(currency)` 的币种从手上这批钱里拿。
- 不用契约生成的 `zMoney` 做校验收口：hey-api 把 `int64` 生成成 `z.coerce.bigint()`，输出 `bigint` 与 `Money.amount: number` 不兼容。
- **展示交给 `Intl.NumberFormat`，不手写符号表与千分位**（2026-10-19）。旧实现是 `SYMBOLS` 表 + `groupYuan` 正则两段手写，
  重新实现的是 `Intl` 已做好的事且做得更差（符号位置写死在小数前、小数位恒 2、未知币种退成 `"XYZ "`）。现在：
    - `locale` 必填（[i18n.md §3.5](i18n.md) 约束 2）——「按谁的语言排」是调用点写得出来的事实。一期 zh/en 输出逐条相同
      （`¥12,345.67`），但那是**当前恰好相同**，省掉参数等于把「不知道当前什么语言」放回来；
    - `currencyDisplay: "narrowSymbol"`——保住今天的 `¥`（默认的 `symbol` 在 en-US 下会渲染 `CN¥`，那是对英文用户可见的行为变更）；
    - 小数位恒 2，**跟 Money 模型（单位是分）而不是跟币种**——照 `Intl` 默认给 JPY 0 位会把我们 `1500` 分静默渲染成 `¥15`，少两个零的钱看着还是钱。真上多币种时这里要连 Money 模型一起数（非 2 位小数币种的最小单位），属 P4；
    - 非法币种（`Intl` 对非 3 字母码抛 `RangeError`）退成「代码 + 数字」，与旧兜底同口径；3 字母未知码由 `Intl` 自己退成「代码 + 数字」（中间是不换行空格 U+00A0），认了；
    - 格式化器按 `locale|币种|小数位` 缓存——列表页逐行调用，构造 `Intl.NumberFormat` 不便宜。
- `splitMoney(m, locale)` 给共享 `Price` 做分段排版（符号小/元整数大/角分小），数据取自 `Intl` 的 `formatToParts`——
  **分组也由它给**，别自己 `split` 字符串（那是「先格式化再加工」的脆弱形状）。
- `compactMoneyText(m, locale)` 是券面那种「整元语义」的钱（满 100 而非满 100.00），尾零按**值**收（0/1/2 位），走 `Intl` 的 `fractionDigits` 而非格式化后 `replace(/\.00$/,"")`。
- `priceRangeText(min, max, locale)` 缺席交回 `undefined`，占位文案归调用方（`@shop/common` 不承载用户可见文案，§4.1）。

### 计数折位（`compactCount`）

- 折位交给 `Intl.NumberFormat` 的 `notation: "compact"`，**不手写「万」**：zh-CN 出「1.2万」、en-US 出「12K」，
  折位单位由语言决定（手写单字的话英文界面会印「1.2万」）。
- 两个数字口径显式给，因为 `Intl` 默认与产品口径不一致：`maximumFractionDigits: 1`（PRD-68 要求一位小数，
  `Intl` 默认按量级自适应会把 12.3万 印成 12万）、输入先 `Math.trunc`（计数是整数域，`12.9` → 12 不进位）。
- 「小于 1 万原样」是产品下限，显式钉住，不交给 `Intl` 的语言差异决定。

### 已知欠账：coupon 的句子还在 `@shop/common` 里

`packages/common/src/domain/coupon.ts` 仍拼中文句子（满 / 减 / 无门槛 / 可用 / 折 / 「9 折」/ 状态名 /
不可用原因），而 §4.1 说 common 不承载用户可见文案。金额那一半已在 2026-10-19 交给 `Intl`
（`couponMoneyText` → `compactMoneyText`），**句子那一半是独立一件活**，范围已量清：

| 落点                                                                    | 现状                                                                                              | 要做什么                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `couponFaceText` / `couponFaceRuleText` / `couponRuleText`              | 拼整句中文                                                                                        | 改成返回**结构化事实**（门槛有无 / 金额 / 折扣十分位 / 封顶），句子由三端 `t()` 出 |
| `UNAVAILABLE_REASON_LABEL` / `COUPON_STATUS_META` / `couponSourceLabel` | 码值 → 中文标签表                                                                                 | 搬进各端 catalog（状态名在多处渲染，是这一批里最大的一片）                         |
| 调用点                                                                  | web `CouponCard` / `ShopCouponPopover` / `CouponPicker`、seller `coupon/model.ts` → `CouponTable` | 4 处，改成按 fact 分派 `t()`                                                       |

**为什么不在本轮顺手做掉**：「9 折」在英文里的说法（`{tenths} off` / `{percent}% off` / `Spend ¥100, get 10% off`）
是产品文案决策，不是机械搬运；带着未经评审的英文句子改 4 个渲染面，比留着中文更糟。
另注：`couponThresholdText` 零调用点（只挂在 barrel 上），迁移时直接删。

- 表单回填走 `moneyToYuan`（无符号、不分组），那条路不经过 `Intl`——`Intl` 的分组只服务展示。

## 布局：版心自己声明宽度；首帧的形状就是最终形状

两条都是 CLS 修完之后剩下的规则面（trace、实测数与复现命令在 [perf/README.md](../../perf/README.md)「两条位移：定性 → 修掉 → 复测」）。它们共同判的是同一件事：**会在数据到达那一刻才第一次出现的几何，就是位移本身**。

- **版心（`mx-auto` + `max-w-*` 那一层）一律带 `w-full`。** 判据不是风格：flex 容器交叉轴上的 item 只要带 auto 外边距，`align-items: normal`(stretch) 就降级成 `flex-start`（Flexbox §9.2），于是 `width:auto` 取 **fit-content** —— 版心宽度改由内容的 max-content 决定，而首屏那一刻唯一有尺寸的子元素往往是一张固有尺寸还没到的图，实测塌成只剩左右内边距的 48px。
  「先看看父级是不是 flex」不是这条规则的替代方案：`w-full` 对块级子元素是**惰性的**（本来就该填满），所以无脑补上在任何位置都不改变现有布局，而逐处判断父级一定会漏一处——漏的那处就是那条位移。回归闸：`packages/common/src/page-shell-width.test.ts`（读 class 字符串，含 `@apply`；它是拼写级的，保证「没人漏写」而不是「布局一定不塌」）。
- **一栏/一条列「存不存在」由异步数据决定时，首帧就得占好位。** 参考实现是工作台侧栏：`WorkbenchSidebar` 的 `pending` 为真时**两列照常渲染、列内出骨架**，而不是先渲染窄壳、权限回来再插 176px 的二级列。占位与实物共用同一组几何常量（`RAIL_*` / `PANEL_*`），所以宽度与行高不可能对不上；骨架行与真实行同 pitch，替换时 y 不变——于是「最终有几条菜单、什么时候到」都不影响结果。
  反面两条别用：给内容列加 `transition` 是把位移变慢而不是消除；在 `beforeLoad` 里等那份数据会把一次 RTT 串在页面取数之前，拖的是 LCP。
  `pending` 的判据要跟着「这栏到底会不会存在」收敛（admin = 已登录 + 首份 me 未落地 + 未失败）：未登录和 me 失败都不该占出一条永远不会出现的列。
  不变量由测试钉住：`packages/app-kit/src/shell/workbench/sidebar.test.tsx`（pending 帧列宽 == 落地后列宽）、`apps/admin/src/layout/app-sidebar.test.tsx`（装配层判据）、`apps/admin/src/layout/nav.test.ts`（入口全是分组——这是「两列都占」的前提，加了顶层叶子入口就要改成按路由判定）。

图这类「固有尺寸晚到」的东西属于同一判据的另一半：`Image` 该带 `ratio` 或 `width`+`height`。它现在不再能推动版心（宽度由版心自己声明了），但仍决定它自己那块的高度，而且是 LCP 的一条。

## 共享词表：一个概念一个出口

**一句话**：一个概念在前端只许有一个出口，且那个出口住在它该住的包里；「另一处也这么写」不是复制的理由，是把它请进 owner 的理由。

后端用 `ValidationVocabularyTest` 钉住「一条规则一个具名常量」，前端此前只靠人记得住。记不住的三份现场证据：

- `apps/web` 里 `DeletionDialog` 从 `@shop/app-kit` 导入 `useCountdown`（相对秒数递减），同 app 的 `OrderCard` 从本地 `#/shared/lib/use-countdown` 导入同名 hook（按绝对时刻倒数）——**同名不同义**，跨文件复制粘贴会静默换语义。后者已改名 `useDeadline`。
- `apps/seller/src/layout/Sidebar.tsx` 是个只转发的包装，却和 `@shop/ui-web` 的 `Sidebar` 重名——本地能 import 到的那个遮蔽了包里的那个。包装已删，`AppShell` 直接用 `WorkbenchSidebar`。
- 同一张卡片上「已售 1234」和「1.2千人收藏」并存：销量只折万、收藏多一条千位折档，**同一个数两种读法**。折万算式收进 `compactCount` 后收藏数弃用了千档。

| 概念         | 唯一出口                                                                                      | 落在哪                                                                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 手机号掩码   | `maskPhone` / `MASK_SEGMENT`（`mask.ts`）                                                     | `@shop/common`；`ui-web` 的 `MaskedValue` 持同形常量                                                                                                                        |
| 大数折万     | `compactCount`（`count.ts`）                                                                  | `@shop/common`                                                                                                                                                              |
| 复制 + 反馈  | `copyWithNotify`（`copy-text.ts`）                                                            | `@shop/app-kit`（要弹 toast，属展示胶水）                                                                                                                                   |
| 金额         | `money.ts` 一族（见上一节）                                                                   | `@shop/common`                                                                                                                                                              |
| 地址字段口径 | `ADDRESS_NAME_MAX` / `ADDRESS_DETAIL_MAX` / 三个 schema（`address.ts`）                       | `@shop/common`；数字的对端在 Java `common/AddressFieldRules`                                                                                                                |
| 运单字段口径 | `CARRIER_NAME_MAX` / `TRACKING_NO_MAX` / `TrackingNoSchema`（`tracking.ts`）                  | `@shop/common`；数字的对端在 Java `common/TrackingFieldRules`（承运商 code 不镜像：它不是用户输入）                                                                         |
| 商品字段口径 | `PRODUCT_NAME_MAX` / `SELL_POINT_MIN` / `SELL_POINT_MAX` / 两个 schema（`product-fields.ts`） | `@shop/common`；对端在 Java `product.dto.ProductFieldRules`，含提示语逐字节相同                                                                                             |
| 规格取值口径 | `SPEC_VALUES_MAX` / `SPEC_VALUE_MAX`（`product-fields.ts`）                                   | `@shop/common`；两条对端不同——条数在 `product.dto.ProductFieldRules`，取值文本在 `product.dto.CategoryFieldRules`（自定义取值以此文本建档进那一列）                         |
| 备注字数预算 | `NOTE_MAX`（`note-fields.ts`）                                                                | `@shop/common`；对端在 Java `common/NoteFieldRules`——买卖家备注、售后理由、运营补录轨迹描述等七个入参共用这一份预算                                                         |
| 券名口径     | `COUPON_NAME_MAX` / `COUPON_NAME_MESSAGE`（`coupon.ts`）                                      | `@shop/common`；对端在 Java `coupon.dto.CouponFieldRules`，提示语由数字派生                                                                                                 |
| 地址标签     | `ADDRESS_LABEL_MAX`（`address.ts`）                                                           | `@shop/common`；对端在 Java `common/AddressFieldRules`，app 侧可更严（见下面第 5 条）                                                                                       |
| 登录手机号   | `PHONE_PATTERN` / `PHONE_DIGITS`（`login-schema.ts`）                                         | `@shop/app-kit`；位数与形状谁改都当场红（门禁第 5 条互推）                                                                                                                  |
| 错误码       | `ErrorCodes`（`error-codes.ts`）                                                              | `@shop/common`；对端在 Java `common.ErrorCodes` 与 `docs/error-codes.md`，四边（含两份 `error.json` 的 `error.<CODE>` 文案）由 `ErrorCodeVocabularyTest` 核对，前端不另立码 |
| CMS 定位值   | `CMS_TARGET_MAX` / `CMS_URL_MAX`（`apps/admin/src/cms/constants.ts`）                         | **app 本地** owner：只有 admin 三页用，不必进 `common`；对端在 Java `cms.dto.CmsFieldRules`                                                                                 |

凡写着「对端在 Java …」的行都不归下面这个门禁管：它们是**跨语言**的等式（TS ↔ Java ↔ 已发布契约 ↔ 迁移列宽），由后端的 `FieldRuleVocabularyTest`（数字那一族）与 `ErrorCodeVocabularyTest`（错误码那一族，另核每处抛码站点的状态码、注册表 `behavior` 那句分支声明、以及每个 code 在两份语言恰有一条 `error.<CODE>`）核对——前端门禁只能扫到前端，用它守跨语言相等会永远绿。

**门禁**：`packages/common/src/shared-vocabulary.test.ts`（node 环境，扫 `apps/*/src` + `packages/*/src` 全部源码），五条规则各挡一种漂移：

1. **app 不遮蔽包导出**——app 本地导出的符号名不得与 `packages/*` 的导出名相同
2. **形状的写法只有一份**——`****` / `/ 10000` / `navigator.clipboard.writeText` 这些字面量只许出现在 owner 文件里（判定在**剥掉块注释**后的文本上做：注释里写 `138****0000` 是给人看的示例，不是第二份实现；行注释不剥，宁可误报不空转）
3. **owner 之间不漂移**——`ui-web` 刻意零内部依赖（纯 UI 包），它的 `MASK_SEGMENT` 必须与 common 的那份**逐字节相等**；常量等式编译期查不了，测试期钉
4. **owner 不是孤儿**——每个 owner 至少有一个真实调用点，且聚合入口 `src/index.ts` 的 re-export 不算调用点
5. **一个概念不许各说一半**——同一件事写成两个数时（位数 `PHONE_DIGITS` 与正则 `1[3-9]\d{9}`、上限 `CONTACT_PHONE_MAX` 与正则 `{5,20}`），后者的长度由源码解析出来与前者的值比对，改一个忘另一个当场红。app 侧自设的上限只许**等于或严于**契约，严于必须在表里登记理由（如自定义标签 4 字而契约 20 字：chip 只显示四个字）。判据按**概念**索引，不按数字索引——`64 / 30 / 6 / 200` 这些数在互不相干的概念里撞车，按数字扫会把门禁做成噪音。**「必须在表里登记」从今天起不是靠记得**：`FieldRuleVocabularyTest.前端数值边界只许登记成三种对边之一`（GEN-64）扫六根全部 `const X = <整数>` 形状的具名数值边界，两向必须等于三张登记表的并集——新建一个不登记会红，把已登记的改名或换成算式也会红（清单自己烂掉这件事同样得红）。三种对边：契约镜像、Java 词表同值、以及「这就是我这一处的策略」（`MAX_AUTO_PAGES` / `RETRY_LIMIT` 这类后端根本不读的数，登记时必须写理由）。

外加两条反空转断言：扫描必须真扫到 >300 个文件 / >200 个导出名，每个 owner 剥完注释后仍命中自己的形状。这两条是本门禁自己踩出来的——`sourceFiles()` 早版先判后缀再递归，只扫到 41 个顶层文件，四条规则全绿却是假绿。同一族还有一条按类名扫源码的：`packages/common/src/page-shell-width.test.ts`（见上面「布局」），它同样带反空转那一条。

新增一个共享概念时的顺序：先想清楚它该住哪（不依赖框架的逻辑进 `common`，要弹提示 / 格式化时间的进 `app-kit`，纯视觉的进 `ui-web`），落 owner，再把形状加进门禁的 `owners` 表。**放宽 allowlist 必须写明理由**（现有唯一一条：`AddressFormDialog` 的 `139********` 是「智能粘贴」输入框的占位示例文案，不产出掩码，也不与 `MASK_SEGMENT` 同形）。

## 前端测试（Vitest + Testing Library + MSW）

```bash
pnpm test            # 全量跑一次（vp test 的 vitest projects：apps/* + packages/*）—— 门禁与收尾才跑
pnpm test:watch      # watch 模式（开发默认挂这个）
pnpm test:project <名字> [路径...]   # 只跑某个 project（+ 可再按路径收窄），开发期首选
pnpm test:changed    # 只跑相对主干改动过的文件——分支离主干远时≈全量，见下
```

这些 script 全是 `vp test run …` 的包装（Vite+ 内置 Vitest 5，仓库不再单独装 `vitest`）；
每个都带 `--fs-module-cache`（见「迭代性能」）。测试文件里 **import 一律来自 `vite-plus/test`**，
不是 `vitest`——`vite-plus/oxlint-plugin` 的 `prefer-vite-plus-imports` 会拦。
project 名字就是各 `vitest.config.ts` 所在目录的包名：`web` / `seller` / `admin` /
`@shop/common` / `@shop/app-kit` / `@shop/ui-web`。实测：

```bash
pnpm test:project @shop/common            # 15 文件 / 0.46s
pnpm test:project web src/order           # 10 文件 / 5.2s（域内再收窄）
```

### 迭代性能：先量后调

全量 `pnpm test` 实测 **39.8s / 117 文件 / 986 用例**（28 核，同一台机器不开 `--fs-module-cache` 是 46.2s）。
Vitest 自己报的耗时分布说清了瓶颈在哪：**import 58% + environment 16% + setup 14%，`tests` 只占 7%**——
慢在「每个文件重新装配一遍模块图」，不在用例本身。

| 旋钮                                                  | 实测                                   | 结论                               |
| ----------------------------------------------------- | -------------------------------------- | ---------------------------------- |
| `--fs-module-cache`                                   | 46.2s → 39.4s，`transform` 桶 15% → 5% | **有收益，已开进全部 test script** |
| `pool: "threads"`                                     | 13.5s → 12.3s                          | 省约 1s，不值当                    |
| `isolate: false`（复用模块注册表）                    | 13.46s，**完全没变**                   | 无效                               |
| `deps.optimizer.ssr.include` 预打包 `@shop/api`/`msw` | 13.4s，**完全没变**                    | 无效                               |

后三个是 Vitest 4 时代量的（表里 13.x s 是当时规模），结论至今没被推翻，别再试。
`fsModuleCache` 是 Vitest 5 才有的开关：把 transform 结果落进 `node_modules/.vitest-cache`（实测 32MB），
7 个 project 在同一轮里共享同一份产物，所以**连冷跑都赢**（43.1s vs 46.2s），CI 那份一次性进程也不吃亏。
它只能走 CLI flag：根 `vitest.config.ts` 的 `test` 块不会被 `projects` glob 继承，写进去是死配置。

**为什么其余旋钮调不动**：一个空测试文件的地板就是 **1.23s**（`setupFiles` 673ms + jsdom 环境 397ms）——
`packages/app-kit/src/test/setup.ts`（模块 id 是 `@shop/app-kit/test/setup`）每个文件都要 import 整个 `@shop/api` SDK + MSW。
配置层能省的是「重复劳动」，省不掉「每文件一份固定开销」。

因此提速只有两条正路，按性价比排序：

1. **少跑**（零成本，收益最大）：开发期挂 `pnpm test:watch`，或按 project + 路径跑 `pnpm test:project web src/order`。改一个域就跑一个域，不要每次全量。
2. **不加固定开销**：纯逻辑只用 Node，不加载 DOM/MSW setup；只有真的要 render/DOM/发请求的测试才装配浏览器与网络环境。
   买家端 `web` 已按 Vitest 5 子项目分成 `unit` / `dom`，`pnpm test:project web` 仍会跑两组。`.test.tsx` 默认进 `dom`；三个 `.test.ts` 例外（结算、倒计时 hook、语言请求头）在 `apps/web/vitest.config.ts` 的 `domTests` 中点名。其余 `.test.ts` 进 Node，不必把业务模块搬到 `common`。
   `seller` / `admin` / `@shop/app-kit` / `@shop/ui-web` 已按同一口径拆开（`packages/common` 本来就是单 node 配置，只补了 `name`）。**`.test.ts` 进 Node 是默认，不是逐个审出来的**——只有三种情况要点名进 `domTests`：读写 `document.cookie` / `window.navigator` / `localStorage`、用 `@testing-library/react` 的 `renderHook`、或依赖 `requestAnimationFrame` 这类真实浏览器 API（`ui-web` 的 `file-upload-store.test.ts` 就是因为上传链里那句 `requestAnimationFrame` 才留在 jsdom）。另有一类不点名也会绿：只用 `@shop/test-utils/fixtures` 造数据的（`makeCategoryNode` 之类）是纯函数，Node 跑得了。

**买家端双环境实测（2026-09-29，Vitest 5.0.1）**：只改测试配置，23 文件走 Node、16 文件保留 jsdom/MSW，前后均为 **39 文件 / 326 用例全绿**，没有删测试或断言。保留现有 `--fs-module-cache`，未清缓存：

| 跑法                      | 原配置                 | 双环境                 | 口径                                                |
| ------------------------- | ---------------------- | ---------------------- | --------------------------------------------------- |
| `pnpm test:project web`   | 14.73 / 14.42 / 13.25s | 13.54 / 13.74 / 12.69s | 三次中位数 14.42 → 13.54s，约快 6%                  |
| 同命令加 `--maxWorkers 2` | 44.86s                 | 35.92s                 | 各一轮，约快 20%；本机限制 worker，不等同于 CI 实测 |

表内取 Vitest 的 `Duration`，不是 shell 墙钟，也不是全冷启动。本轮只调整环境/setup，没有降低隔离或缩减覆盖；本机默认并发下收益有限，不承诺全仓或 CI 同比例提速。测量工作区另有国际化并行改动，这些数值是本轮观察，不作为固定提交的性能基线；完整验收需在工作区稳定后重跑。

**其余四个包推广后的实测（同日、同机、各三次取中位数）**：`seller` 20.3s → 15.9s（30 文件，16 个 `.test.ts` 进 Node）、`admin` 10.2s → 8.6s（15 文件，7 个进 Node）、`@shop/ui-web` 1.6s → 1.4s、`@shop/app-kit` 7.6s → 7.3s（14 文件里 6 个进 Node，收益最小——它一半用例本来就在测渲染）。**测试文件数、用例数一个没动**，只是换了环境。

> 改测试环境配置后**先 `rm -rf node_modules/.vite/vitest` 再下结论**。`--fs-module-cache` 的产物按配置指纹分目录，拆成子项目后目录名变了，旧缓存不会自动失效：实测不清理时 `@shop/app-kit` 凭空多出 26 条红（locale / provider / login-form 全军覆没），清完同一份代码 14 文件 93 用例全绿。这批红是缓存假象，别照着它去改业务代码。

还有一条正交的路：**同一套门禁跑第二遍时不必重跑**。`pnpm exec vp run verify`（定义在根 `vite.config.ts` 的 `run.tasks`）把
`vp check` / `pnpm typecheck` / `pnpm test` 串成一条，三段各自指纹缓存。实测冷跑 **53.9s**，零改动重跑 **0.36s**
（`3/3 cache hit (100%), 49.90s saved`）；只改一个 lint-only 文件时 `[1] vp check → Cache miss: '...' modified`，
后两段仍命中（4.33s + 37.98s saved）。**pre-push 的 `verify` 作业跑的就是这条命令**：本地手动验证与 push 前门禁同一条路径、同一套指纹，所以「手动验完再 push」不再重跑一遍全量测试；源码/测试/配置/依赖任一变化照常失效，完全相同的状态直接重放。冷跑仍是一遍全量，这里省的是第二次等待。
**`cache.input` 里那两条 exclude 是承重的，别顺手删**：Vite Task 的 `auto: true` 输入集包含任务自己的产物，而 pnpm
每次跑都换名重写 `node_modules/.pnpm-task-run-state-v1/.tmpXXXX`、Vitest 写 `node_modules/.vite/vitest/<hash>/results.json`——
于是「任务修改了自己的输入」，三段永远不命中（实测连 1/3 都做不到，`vp run --last-details` 就是这么查出来的）。
只排这两个具体路径，**不要排 `node_modules/**`**：那会把依赖变更一起排掉，装完新依赖仍重放旧绿，缓存就从加速变成说谎。

### 两个坑：一个已修，一个还在

- ~~`vitest related` 在本仓库静默漏跑~~ **Vite+ 之后可用了**：它反查模块图时走的是 vite-plus 的 `tsconfigPaths` 解析，`#/` 别名不再是瞎的（实测 `apps/seller/src/shop/constants.ts` → 拉起只通过 `#/shop/constants` 引它的 `shop-form.test.ts`；`apps/seller/src/product/queries.ts` → 3 个文件；`packages/common/src/domain/money.ts` → 73 个文件，那基本等于全量）。所以 `pnpm exec vp test related <文件>` 现在是条 dependable 的快路径——注意**退出码 0 + 「No test files found」既可能是真的没人引它，也可能是你给错了路径**，先确认文件存在。
- **`--changed` 是相对主干算的**：本仓库当前分支离主干较远时它≈全量（Vitest 4 时代实测拉起过全部文件），只在「分支短且已 rebase」时才有意义。

其余已知事实：

- 慢的从来不是「测试体」：全量墙钟里 `tests` 桶只占 7%（39.8s 里约 2.8s），大头是 import / environment / setup。单文件也一样：`seller/coupon/CouponFormDialog.test.tsx` 自己 2.4s，但它在 `pnpm test:coverage`（7 个 project 并发 + V8 逐文件插桩）里能被拖到 14s——所以那条最重的用例显式写了 15s timeout，**不是因为它慢，是因为并发跑时 5s 默认线量到的是抢 CPU 的账**。别把全局 `testTimeout` 抬起来迁就它：别处真挂住就该 5s 就报。
- **不要为了「跑得快」把测试拆细或合并**——门禁的强度来自用例覆盖，39.8s 在 28 核上是可接受的；慢的正确做法是少跑，不是少测。
- 疑似 flaky 排查：`--changed` 跑法下曾偶发 1 例失败而全量连跑 3 次全绿（未定位到具体用例）。若再现，记下用例名再查，不要当成「配置问题」改配置。

### 分层与位置

- 纯逻辑单测（cart/order-status/money 等 `*.test.ts`，默认 node 环境）；组件/集成测试走 jsdom + Testing Library（`*.test.tsx`；少数需要浏览器语义的 `.test.ts` 在各 `vitest.config.ts` 的 `domTests` 里点名，见「迭代性能」第 2 条）；server function 的真实行为交给 E2E（Playwright，仓库根 `e2e/`，`pnpm test:e2e`，CI 里跑下单主路径与发货物流链路）
- **测试文件与被测模块同目录、同名**（`xxx.ts` → `xxx.test.ts`），不建 `__tests__`/`test/` 用例目录；`src/test/` 只放跨模块测试装置（setup/render），共享 handler 与假数据进 `packages/test-utils`
- `describe/it/expect/vi` 显式从 **`vite-plus/test`** 导入（不开 globals，也不从裸 `vitest` 导入——oxlint 的 `vite-plus/prefer-vite-plus-imports` 会红）；route 文件保持薄，业务逻辑放独立模块才可单测

### 怎么写

- 一个测试只讲一件事：Given / When / Then，标题说**行为与后果**（含理由：`下架 ≠ 缺货`、`PAID → pending_shipment`），不用函数名当标题
- 断言可观察后果（错误文案、弹窗关闭、请求体），不断言渲染次数/内部 state（React Compiler 自动 memo，渲染计数断言必碎）；形状断言用 `toMatchObject` 聚焦关心字段
- 异步等确定性信号：`userEvent.setup()` + `findBy*/waitFor`，禁止 `sleep()` 凑时间
- 夹具：契约级假数据（`makeAddress`、`makeProductResponse` 等）只住 `packages/test-utils`，且**必须过 SDK zod schema**（连 UUID 格式都校验）；测试文件里留 `makeXxx(overrides)` 只是**一行 wrapper**（传自己那批 id + 本用例关心的维度），不在测试文件里从零重搭同一份契约响应——由 `packages/common/src/shared-vocabulary.test.ts`「契约夹具只搭一次」钉。不做跨文件共享的可变 fixture
- 纯逻辑测试取夹具走 `@shop/test-utils/fixtures` 子入口（只要夹具本身）：从 barrel `@shop/test-utils` 进会连带把 msw / RTL / jest-dom 拉进模块图，白付几百毫秒
- 改 bug 先写复现测试再修

### 网络与渲染约定

- **只 mock HTTP 网络层（MSW），禁止 `vi.mock` 业务模块/内部函数**——mock 实现会让测试跟实现绑死
- 默认 handler 集中在 `packages/test-utils`，按 openapi 契约 mock；用例内用 `server.use(http.xxx(...))` 局部覆盖并捕获请求体，断言「业务形状 → wire 形状」投影（如 receiver → receiverName）
- 组件测试一律走 `renderWithProviders`（`@shop/app-kit/test`，三端统一薄包装，挂独立 QueryClientProvider；需真实路由上下文的用同处的 `renderWithRouter`），不裸用 `render`
- 查询用可访问性语义：`getByRole` / `getByLabelText`，禁 className 查询；label 文本必须纯净（必填星号走伪元素，不进 textContent）

### 什么测 / 什么不测

- **必测**：换算/状态机等决策逻辑（含边界与兜底）、wire→领域投影映射、表单流与请求体、bug 回归
- **不测**：纯类型、纯透传 re-export、zod schema 字段罗列（SDK 生成物自带校验）；快照测试一律不用
- **库行为不逐组件复制**：基建组件在其所在包测一次（如 `QueryBoundary` 的「失败 → 块级错误 + 重试」链路，见 `packages/app-kit/src/data/query-boundary.test.tsx`），业务组件不再复制同款三态用例；业务组件只测自己的差异化逻辑（如 `navTitle` 宽度预算截断）。纯展示型状态分支靠 business-rules 条目承载，值不上测试行数的不写
- 心智标准：这个分支里若藏着一个错的映射/反的布尔/漏掉的兜底，测试能不能红？能红才写

### 已知坑

- MSW handler path 必须写 `*/user/...` 通配形式（裸 `/user/...` 按 jsdom origin 解析，匹配不上 SDK 打到 8080 的请求）
- 要测「非 2xx 按 status 分支」的行为（如 404 = 没有记录），依赖 `@shop/app-kit/test/setup` 里
  `configureSdkClient("http://localhost:8080")`（各 app 的 `setupFiles` 都指向它）：不装配时非 2xx 走 ky 自己的抛错路径（会预读 body），
  hey-api 解析时报 "Body is unusable"，调用方只拿到 `{status: 0}` 网络错误，404 分支永远测不到。
  baseUrl 必须是绝对地址——jsdom 的 `new Request()` 来自 undici，相对 URL（线上的同源 `""`）直接抛错。
  还要在 `beforeAll` 里**再压一次** `client.setConfig({ baseUrl: "http://localhost:8080" })`：
  测试文件 import 业务域时会连带 import app 的 `#/shared/**/api` 装配，那份按浏览器语义把 baseUrl 覆盖成 `""`，
  于是所有请求变成 status 0（`beforeAll` 在所有测试模块 import 之后才跑，所以这一压有效）
- 列表页的 hook 测试要先把登录态与店铺上下文造出来：seller 侧 `useMyShops` 只在 `authed` 时拉
  `/shops/mine`（测试里 `tokenStore.set("...")`，别忘 `afterEach` 里 `clear()`），
  `useCurrentShop` 解析出的 shopId 进缓存 key，没就位时失效的是另一棵树
- **app 测试不要自己 `new QueryClient()` / 用裸的 `createTestQueryClient()`**：全局 `throwOnError`、写操作的全局 toast 与 `meta.invalidates` 失效都挂在 `createAppQueryClient()` 的默认值上，裸 client 会让它们「生产里一定发生、测试里从不发生」。`@shop/app-kit/test` 导出的 `renderWithProviders` / `createAppTestQueryClient` 就是「应用真实默认值 + 禁 retry」，一律走它们；`@shop/test-utils` 的 `createTestQueryClient` 只留给底层包自己测库行为用（它不 import app-kit，反向依赖会成环）。改这套默认值时要同步跑全量测试——`pnpm test` 里那几条「成功后三棵缓存一起失效」的用例正是靠它才生效的。
- pre-push 的 `verify` 作业（`vp check` + typecheck + `pnpm test`，带缓存）跑前端测试；各 app 的 vitest 配置都不开 `passWithNoTests`：用例被误删要能被 CI 发现

## 打包体积（判据是产物，不是 import 形状）

**先量后改**，量法是 `pnpm perf:attrib`（把首屏字节按 sourcemap 归属到源文件）与它的 `--why <子串>`（谁把它带进首屏）。别拿 import 形状当证据——但反过来，**「import 形状无关紧要」也只对了一半**，见下。

- **「barrel 挡住 tree-shaking」在 `packages/*` 不成立**：实测把 `packages/ui-web` 与 `packages/app-kit` 两个 barrel 改成调用点直连子模块，产物字节几乎没变（≈0），改动已回滚。那里 tree-shaking 本来就在工作。
- **它成立的地方是「有没有 `sideEffects` 声明」**。`packages/{api,ui-web,app-kit}` 早就各自带着，而**三个 app 的 `package.json` 一直没有**——于是从任何 barrel 引一个符号，就得把那个域里所有模块连同它们的依赖一起背上（打包器不能假定模块是干净的）。补上之后买家端首屏 **568KB → 332KB gzip**（预加载链接 63 → 40 个），卖家 / 管理端 ≈0（它们的首屏是登录页，本来就没引域 barrel）。app 侧写的是 `"sideEffects": ["*.css"]` 而不是 `false`：`main.tsx` 裸 `import "./styles.css"` 是真副作用，`false` 会把三端样式整份摇掉（web 用 `?url` 引样式，但三端保持同一个形状，别留一个例外等人踩）。
- **`lazy()` 不生效的那条边是 barrel**：同一个模块被静态引一次，动态引它就切不出块，Rolldown 直接印 `[INEFFECTIVE_DYNAMIC_IMPORT] <mod> is dynamically imported by A but also statically imported by B`。这条警告就是探测器——**构建里出现它，说明某个 `lazy()` 是白写的**。登录弹窗正是这个形状：`SiteHeader` 静态要 `logout`、`__root` 懒加载要 `LoginDialog`，同一个 `#/auth` 桶两头用，整条 `LoginForm → PhoneField → libphonenumber` 链（54KB gzip）就留在入口 chunk 里被每个页面预加载。做法是把**只有懒加载会用的导出留在桶外**（`#/auth/LoginDialog` 直连），桶里只留静态消费的符号。

量到的现状（e6aebb6e + 上述修复）：首屏 JS `web/client` 332KB · `seller` 233KB · `admin` 214KB。原先挂在 TODO 的「Embla 落在 `/welcome` 也加载的共享 chunk」已随之消失（`--why embla` 现在报「不在首屏」）。**zod 不是那条账**：`packages/api` 生成物 122KiB 是 raw 字节，落到首屏是 41KB gzip（运行时 30 + schema 11），而运行时那份是「契约漂移要能报警」的定价——按域拆 schema 入口最多拿回 11KB，不动。

## 自动修复：判据是门禁红绿，不是 warning 数

`vp fmt`（oxfmt）是纯格式化，幂等、可全仓跑。`vp check --fix` / `pnpm lint:web:fix` 除了格式化还连带跑 oxlint 的修复器，它按「这条规则通常这样改」动手，不编译、不跑测试，所以**全仓一把梭不安全**：实测一次全仓 fix 改 19 个文件，同一批里它删了 `as HTMLElement | null` 这类它以为多余的断言、把 `x[x.length - 1]` 改成 `.at(-1)`（NodeList 上没有 `at`，运行时就是 TypeError），在 vendored 的 `packages/ui-web/src/components/reui/**` 造出 6 个新 error。口径：逐目录跑，跑完必跟 `pnpm exec vp check` + `pnpm test` 再决定留不留；已手动钉过的写法（如 `data-grid-cell-selection.tsx` 用 `.item()` 取末行）不要顺手改回去。

## 告警预算：warning 不参与门禁，所以更要能读

`vp check` 只有 error 才非零退出（实测 0 error / 618 warnings 时 exit 0），warnings 是暴露台账而不是拦子。台账的前提是**它能被读完**，所以 vendored 代码不参与：`packages/config/oxlint.config.ts` 的 reui override 除原先 13 条外，把风格/建议类整族（`unicorn/no-null`、`prefer-at`、`prefer-spread`、`eslint/no-shadow`、`typescript/no-*assertion*`、`react-doctor/no-giant-component` 等 31 条）对 `**/components/reui/**` 关闭。

- 效果：全仓 618 → **49 条 warning，且 100% 是第一方**（reui 命中数实测 0）。原先那 581 条来自 data-grid 与 cascader 两个 vendored 目录，改它就是 fork。
- 关掉的 31 条**全是 warn 级**（改前后 `vp check` 的 error 数恒为 0）。error 级规则对 reui 依旧生效（`typescript/no-floating-promises`、`unicorn/*-error` 那批、`tanstack-*`，加 tsc strict + `noUncheckedIndexedAccess`）；唯一的例外是原先那 13 条里就关掉的 `typescript/no-unnecessary-condition`，理由见上面的逐条注释。
- override 的 key 写错不报错、静默不匹配（同一族的坑见配置文件 :355-364 的 glob 注释）。所以改这块的规则后必须复跑 `pnpm exec vp check` 并数一遍 reui 命中数，别只看总 warning 数降没降。
