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
- **Schema 归属**：Schema 跟着读取和解释数据的模块放；仅供一个表单使用时，默认放在表单文件内；同一规则需要复用时再提取共享。
- 表单：用 `useAppForm`（`@shop/ui-web`，TanStack Form + Zod validators），不手写裸 state 表单。周边一并统一：校验放表单级 `validators.onSubmit`（不用字段级 onChange）；提交接线 `onSubmit={(e) => { e.preventDefault(); void submitForm(form) }}`（`submitForm` 来自 `@shop/app-kit`）——**不写 `void form.handleSubmit()`**：void 只丢返回值、不接 rejection，`onSubmit` 抛出的错误会变成未处理的异步异常。`onSubmit` 内部该抛就抛（框架才把 `isSubmitSuccessful` 置回 false），`submitForm` 接住它并把「非接口错误」上报监控。**不要在 `onSubmit` 里 `catch {}` 了事**：那会把「代码坏了」那一类也静默吞掉，用户看到的是「点了提交什么都没发生」、监控里也没有记录。2026-10 三端表单与 `@shop/app-kit` 的共享表单（登录、`ReasonForm`）已全部收口，仓库里不再有内联 `void form.handleSubmit()`（只有说明为什么不用它的那几句注释）；服务端/表单级错误用 `<FormError>`；弹窗表单体挂在 `DialogContent` 里（关闭即卸载、打开即按 props 重算默认值，不写 effect + `form.reset`）；页脚用 `DialogFooter`，取消按钮 `variant="outline"`，提交按钮 `{pending && <Spinner />}文字`、pending 读 mutation 的 `isPending`；弹窗内字段竖排、整页表单 label 左列（`orientation="horizontal"`）
- 后端 422 的**字段级**那一句落回框上只有这一条路：`applyServerFieldErrors(form, serverFieldErrors(error, map))`，然后 `throw error`（交给 `submitForm`）。`map` 是「DTO 字段名 → 表单字段名」的**白名单**——没列的不落框（仍由全局 toast 讲），同名字段也要显式列；没有输入框的路径刻意不列（`Money` 是 `amount`+`currency` 一对列、界面上没有那一个框，落哪个都错）。数组路径认（key 就是注册字段名 `rows[1].priceText`），但**服务端下标不一定等于行号**：请求体按投影生成（库存模式丢掉未定价的行），map 要跟着投影算下标，见 `EditSkuDialog.tsx` 的 `skuServerFieldMap`——落错框比不落框糟，用户会去改一个没错的规格。不写 `setFieldMeta` 手写 `errorMap.onServer`：实测 1.33.5 在「表单级 validators + 字段无 validator」那个组合下改值清不掉它，`isValid` 永久 false，**用户改对了也提交不了**（回归用例在 `server-field-errors.test.tsx`）。
  弹窗要用这条通道还有个前置条件：**失败不关窗**——`onConfirm`/`onShip` 返回 promise、`await` 完再关，先关等于把表单一起卸载、那句话用户看不见。行内动作的 `useRowBusy.run()` 已把动作的 promise 原样透出（复位由兜底分支负责，所以发射即忘的调用点不会漏出 unhandledRejection）。

## 状态归属（前端）

原则：**状态在哪里产生（最先可观测），就在最近的消费者处理它**。可观测点由取数机制决定，不机械绑定组件层级：

- query hook → **失败交给错误边界，挂起就地渲染**：`throwOnError` 已是全局默认，页面主体数据失败由路由 `errorComponent` 接管，区块失败由 `QueryBoundary` 接管（见「错误与重试」）；只有**头上没有边界可接的查询**（页头角标、收藏心形、弹窗/向导内部件，或消费方本就写「拿不到就不画」的附属区块）才显式 `throwOnError: false` 并在组件里渲染 `isError`
- 派生态（如 empty：`data.length === 0`）→ 派生它的那一行所在组件
- mutation 错误 → 全局 `MutationCache` 按 `meta.error` 提示（渲染点在根部，已是产生点最近的消费者）；乐观态 → 缓存 patch 层（`optimisticListMutationOptions`），列表行只读缓存
- 组件内部瞬时状态（上传进度/提交中按钮）→ 留在组件内；出现第二个消费者才上提为域内 `use-*.ts`（与 hook 上提规则同构）
- route loader / `useSuspenseQuery` → 状态上移到 `pendingComponent`/`errorComponent`/Suspense 边界，父组件不再接触 query

分界线：往子组件传**状态标志**（`isPending`/`error` props）= 放错位置的味道——子组件被迫认识"状态是什么"，还会长出可空 props；传**处理后的结果**（`deriveXxx` 视图模型、骨架屏或数据二选一）= 干净——子组件只管"拿到什么画什么"。

## 客户端共享状态：按需用 Zustand

- 当前只用于 seller 的店铺选择：[shop-store.ts](../../apps/seller/src/shared/lib/shop-store.ts) 用 `zustand/vanilla` 保存用户显式选择的 ID；React 在 `shop/queries.ts` 用 `useStore` 订阅。店铺列表和详情仍归 Query，表单归 Form，筛选/分页归 URL，局部 UI 状态不为统一而搬库。
- 写入只走 `setCurrentShopId`（包括登出清空），不直接调 store 的 `setState` 绕过持久化与请求头同步。
- 用户选择仍以纯 ID 存在 `localStorage.shop_seller_current_shop`；当前请求的有效店铺由 `useCurrentShop` 根据营业状态解析，兜底结果不写回用户记忆。解析值不进响应式 store，避免渲染期通知组件。此单例只用于 seller SPA，不复用到买家 SSR 的用户状态。

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
- **loader 用 `queryClient.query`，不用已废弃的 `ensureQueryData`**。可变业务数据用领域默认新鲜度或 `Infinity`（尊重失效），收银台用 `0` 强制读最新；`"static"` 连失效也忽略，只用于明确允许无条件复用的预取（论证见 query-convergence.md §2）。
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
    meta: {
        success: message("web.order.toast.cancelled"),
        error: message("web.order.toast.cancelFailed"),
        invalidates: [MY_ORDERS_KEY],
    },
})
```

为什么是这个形态（官方刻意不表态失效、全局回调先于逐点、不做 `useWriteMutation` 工厂的完整论证）见 query-convergence.md §3。

`MutationMeta` 只有四个字段（`packages/app-kit/src/data/mutation-meta.ts`）。`success` / `error` 只收 catalog 工厂产出的 `CheckedMessageFact`：应用从 `#/locales/message` 导入 `message`，共享层使用 `appKitMessage`。构造时检查 key、必填参数与参数名；手写对象和裸串编译不过。运行时仍是 `{ message, params? }`，与表单消息事实同形；`MutationCache` 在弹出时通过 `resolveToastText` 读取当前 i18next 语言，不提前调用 `t()`。

| 字段          | 作用                                                           | 缺省行为                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `success`     | 成功提示文案                                                   | **不填即不提示**（「要不要提示」由有/无承载，所以没有 `silentSuccess`）                                                                                                                                      |
| `error`       | 失败兜底文案                                                   | 多数轮不到它——命中 code 时弹 catalog 那句（i18n.md）。它只在「拿不到响应**且没有码**」时顶上（`status === 0` 且非 SDK 拦截器产生），没给则退 `error.network`。断网 / 超时 / 取消三族现在**有码**，走 catalog |
| `silentError` | 该写操作自己渲染/吞掉错误（表单内联报错、会话终结）            | 一律弹全局失败提示                                                                                                                                                                                           |
| `invalidates` | 这份回执让哪些查询失效（**真实 query key**，前缀匹配一发命中） | 不失效任何缓存                                                                                                                                                                                               |

写新写操作时的四条硬规矩：

1. **`invalidates` 传真实 query key，不要发明 tag**：tag 表等于在 query key 之外再造一棵命名树，新增读取方时没人会记得补 tag（与「不造第二棵 key 树」同一条理由）；而且它表达不了「由变量算出的 key」——那种情况用库自己的 `onSuccess`。
2. **`silentError` 是显式声明，不是逃生舱**：只有「错误已经在别处被用户看见了」才用它。表单内联渲染时，那句要经 `errorText`（§7.3 那条链）取，**不要自己读 `err.detail`**；后端把裁定落在具体字段上时读 `err.errors`（`ApiFieldError`：`{ field, message, value? }`），按 `field` 标红那一个输入框、把 `value` 嵌进当前语种的那句（范本 `apps/seller/src/product/forbidden-word.ts`），**不许从中文 `detail` 里正则捞字段名**。另一正当用途是登出：本地身份已清且人已在登录页。
3. **乐观更新写 `useMutation(optimisticListMutationOptions({ ... }))`**：官方那三步（`onMutate` 取消在途 → 快照 → patch；`onError` 回滚；`onSettled` 失效）顺序写反了只在并发下偶发出错，所以固定在一次实现里，只把「怎么 patch」交给领域；反馈不在它里面（全局负责）。
4. **危险操作的二次确认走全局 `confirm()`（`@shop/ui-web`）**：`const ok = await confirm({ title, description, confirmText, action })`，与 `notify` 同级的全局收口——调用点不再持 `open` state、不铺弹窗骨架，根布局只挂一份 `<ConfirmDialogHost />`。`action` 传 `mutation.mutateAsync(...)`：promise 期间按钮转圈，成功关面，失败保持打开等重试。只在客户端事件回调里调，不要在渲染期/SSR 阶段调。**「未保存离开」守卫不自己拼 `useBlocker` + 弹窗**：用 `useUnsavedLeaveGuard(when, { beforeUnload, onLeave })`（`@shop/app-kit`），它把路由拦截、关页兜底和同一个确认面一次接好。

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

| 要做的事            | 用什么（默认在 `@shop/common` 的 `money.ts`，例外见行内）                                                                                                      | 不要                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 展示一笔钱          | `formatMoney(m, locale, placeholder?)` / 共享 `Price` 组件（分段排版，符号跟币种）                                                                             | 各处手写 `¥${fenToYuan(m.amount)}` |
| 加减乘件数求和      | `plusMoney` / `timesMoney` / `sumMoney`（跨币种抛错，不静默相加）                                                                                              | `.amount` 抠出来做算术             |
| 表单回填            | `moneyToYuan(m)`（无符号、不分组、补齐两位）                                                                                                                   | 拿 `formatMoney` 的结果塞进 input  |
| 元输入 → Money      | `yuanToMoney`；seller 表格单元格的 `yuanPriceSchema`（`apps/seller/src/product/draft-model.ts`，格式校验 + 委托 `yuanToMoney` 换算，币种默认平台定价币种 CNY） | 自己 `Number(v) * 100`             |
| 判两笔钱是否同一笔  | `sameMoney`（Money 是值对象，`===` 比的是引用）                                                                                                                | `a.price !== b.price`              |
| 比大小 / 取最低最高 | `compareMoney` / `minMoney` / `maxMoney`（跨币种抛错，空集合给 undefined）                                                                                     | `.amount < .amount`、自己写 reduce |
| 判这笔钱有没有值    | `isPositiveMoney`（优惠为 0、门槛为 0 都是「没有这一项」）                                                                                                     | `m.amount > 0`                     |
| 划线价该不该画      | `strikethroughPrice(original, price)`（等于成交价就是不打折）                                                                                                  | 每个渲染点各判一次大小             |

- 缺席的钱显式给占位符（`formatMoney(undefined, locale)` → `—`）：`¥0.00` 和「没有数」是两件事，前者会被读成免单。
- 造零值不凭空预设币种：`sumMoney` 非空时起点币种跟第一笔钱，`zeroMoney(currency)` 的币种从手上这批钱里拿。
- 不用契约生成的 `zMoney` 做校验收口：hey-api 把 `int64` 生成成 `z.coerce.bigint()`，输出 `bigint` 与 `Money.amount: number` 不兼容。
- **展示交给 `Intl.NumberFormat`，不手写符号表与千分位**。手写那套（符号位置写死在小数前、小数位恒 2、未知币种退成 `"XYZ "`）是重新实现 `Intl` 已做好的事且做得更差。现在：
    - `locale` 必填（见 [i18n 规范](i18n.md)）——「按谁的语言排」是调用点写得出来的事实。一期 zh/en 输出逐条相同
      （`¥12,345.67`），但那是**当前恰好相同**，省掉参数等于把「不知道当前什么语言」放回来；
    - `currencyDisplay: "narrowSymbol"`——保住今天的 `¥`（默认的 `symbol` 在 en-US 下会渲染 `CN¥`，那是对英文用户可见的行为变更）；
    - 小数位恒 2，**跟 Money 模型（单位是分）而不是跟币种**——照 `Intl` 默认给 JPY 0 位会把我们 `1500` 分静默渲染成 `¥15`，少两个零的钱看着还是钱。真上多币种时这里要连 Money 模型一起数（非 2 位小数币种的最小单位）。
    - 非法币种（`Intl` 对非 3 字母码抛 `RangeError`）退成「代码 + 数字」；3 字母未知码由 `Intl` 自己退成「代码 + 数字」（中间是不换行空格 U+00A0），认了；
    - 格式化器按 `locale|币种|小数位` 缓存——列表页逐行调用，构造 `Intl.NumberFormat` 不便宜。
- `splitMoney(m, locale)` 给共享 `Price` 做分段排版（符号小/元整数大/角分小），数据取自 `Intl` 的 `formatToParts`——
  **分组也由它给**，别自己 `split` 字符串（那是「先格式化再加工」的脆弱形状）。
- `compactMoneyText(m, locale)` 是券面那种「整元语义」的钱（满 100 而非满 100.00），尾零按**值**收（0/1/2 位），走 `Intl` 的 `fractionDigits` 而非格式化后 `replace(/\.00$/,"")`。
- `priceRangeText(min, max, locale)` 缺席交回 `undefined`，占位文案归调用方（`@shop/common` 不承载用户可见文案，§4.1）。

### 计数折位（`compactCount`）

- 折位交给 `Intl.NumberFormat` 的 `notation: "compact"`，**不手写「万」**：zh-Hans-CN 出「1.2万」、en-US 出「12K」，
  折位单位由语言决定（手写单字的话英文界面会印「1.2万」）。
- 两个数字口径显式给，因为 `Intl` 默认与产品口径不一致：`maximumFractionDigits: 1`（PRD-68 要求一位小数，
  `Intl` 默认按量级自适应会把 12.3万 印成 12万）、输入先 `Math.trunc`（计数是整数域，`12.9` → 12 不进位）。
- 「小于 1 万原样」是产品下限，显式钉住，不交给 `Intl` 的语言差异决定。

### 已知欠账：coupon 的句子还在 `@shop/common` 里

`packages/common/src/domain/coupon.ts` 仍拼中文句子（满 / 减 / 无门槛 / 可用 / 折 / 「9 折」/ 状态名 /
不可用原因），而 §4.1 说 common 不承载用户可见文案。金额那一半已交给 `Intl`
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

## 响应式（三端）

**一句话**：页面级布局用 `lg` 断点收单栏、组件级适配优先容器查询；web 必须适配手机，seller / admin 是桌面工作台、不做移动形态。

- **断点用 Tailwind 默认档**（`sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280 / `2xl` 1536），不新增自定义断点。版心宽度是另一回事（`--container-page` / `--container-narrow` 的 `max-w-*`），与断点无关。
- **页面级堆叠统一在 `lg`**：`flex-col lg:flex-row`、`grid-cols-1 lg:grid-cols-*`。**不可压缩的固定轨道必须回落单栏**——商详右栏 594px、购物车结算栏 360px 这类写死的宽度在窄屏会把整栏顶出视口，且没有滚动或折叠入口。`shared/ui/DetailColumns` 就是这条的收口处（窄屏 `grid-cols-1`），新的双栏别各写一份。
- **组件级适配优先容器查询**（`@container` + `@2xl/…`），不用视口断点：组件跟着**自己的容器**变，放进任意窄栏都对。参考 `order/OrderCard.tsx`（`@container/order`）。
- **`useIsMobile()`（ui-web，阈值 768）只用于组件内部的形态切换**（如 shadcn `Sidebar` 的移动抽屉），**不用于页面布局堆叠**。两者阈值不同是刻意的：布局堆叠是版式决策（`lg`），移动抽屉是交互形态决策（`md`）。一个组件里若同时用视口断点和 `useIsMobile` 判同一件事，就是两套口径打架。
- **三端目标视口**：
    - **web（买家 SSR）必须适配手机**（≥320px）：新增页面按上面规则做窄屏堆叠，不引入固定宽度不可压缩的轨道。
    - **seller / admin 是桌面工作台，不提供移动端形态**：侧栏固定 270px（rail 96 + panel 176）、壳 `h-svh`，<768px 不保证可用。给 B 端加功能不要求做移动适配，但**不要引入「看着能适配、其实没接线」的假能力**（如 ui-web `Sidebar` 的移动抽屉在 B 端从未挂载）。
- **固定高 / 满屏约束要随断点一起收**：为桌面双栏写的 `sticky` + `min-h-[calc(100vh-…)]`，在窄屏回落单栏后会变成一片空白（CTA 被 `mt-auto` 推到最底）。这类约束加 `lg:` 前缀（见 `products/detail/constants.ts` 的 `DETAIL_LAYOUT`），别让桌面版式漏进单栏。
- **骨架占位与真实布局同断点**：占位元素用和真内容同一组形状类（如画廊主图框移动端 `aspect-square`、`lg` 起 `h-141`），换断点时两边一起变，否则跳版。

## 共享词表：一个概念一个出口

**一句话**：一个概念在前端只许有一个出口，且那个出口住在它该住的包里；「另一处也这么写」不是复制的理由，是把它请进 owner 的理由。

后端用 `ValidationVocabularyTest` 钉住「一条规则一个具名常量」，前端靠 `shared-vocabulary.test.ts`（下节）钉住同一个判据。这条判据的由来是一类真实漂移：`apps/web` 曾同时存在 `@shop/app-kit` 的 `useCountdown`（相对秒数）与本地 `#/shared/lib/use-countdown`（按绝对时刻倒数）——**同名不同义**，复制粘贴会静默换语义；后者已改名 `useDeadline`。`Sidebar` 同名遮蔽、同一张卡片两种折位读法是同一类。

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

**跨语言字段约束**：结构化数值直接引用 `@shop/api/schemas` 的生成数据，前端保留上表中的语义出口，不再手写相同数字。生成流程、例外分类与验证命令见 [field-constraints.md](field-constraints.md)。`FieldRuleVocabularyTest` 继续守 Java 注解、契约和数据库列宽，只对前端更严格限制与尚未结构化的规则保留数值登记；错误码仍由 `ErrorCodeVocabularyTest` 与生成检查守护。

**门禁**：`packages/common/src/shared-vocabulary.test.ts`（node 环境，扫 `apps/*/src` + `packages/*/src` 全部源码），五条规则各挡一种漂移：

1. **app 不遮蔽包导出**——app 本地导出的符号名不得与 `packages/*` 的导出名相同
2. **形状的写法只有一份**——`****` / `/ 10000` / `navigator.clipboard.writeText` 这些字面量只许出现在 owner 文件里（判定在**剥掉块注释**后的文本上做：注释里写 `138****0000` 是给人看的示例，不是第二份实现；行注释不剥，宁可误报不空转）
3. **owner 之间不漂移**——`ui-web` 刻意零内部依赖（纯 UI 包），它的 `MASK_SEGMENT` 必须与 common 的那份**逐字节相等**；常量等式编译期查不了，测试期钉
4. **owner 不是孤儿**——每个 owner 至少有一个真实调用点，且聚合入口 `src/index.ts` 的 re-export 不算调用点
5. **一个概念不许各说一半**——同一件事写成两个数时（位数 `PHONE_DIGITS` 与正则 `1[3-9]\d{9}`、上限 `CONTACT_PHONE_MAX` 与正则 `{5,20}`），后者的长度由源码解析出来与前者的值比对，改一个忘另一个当场红。app 侧自设的上限只许**等于或严于**契约，严于必须在表里登记理由（如自定义标签 4 字而契约 20 字：chip 只显示四个字）。判据按**概念**索引，不按数字索引——`64 / 30 / 6 / 200` 这些数在互不相干的概念里撞车，按数字扫会把门禁做成噪音。**手写数字必须登记，生成引用不用登记**：`FieldRuleVocabularyTest.前端手写数值边界必须登记理由或对边`（GEN-64）扫描六个前端根目录的生产源码，将手写整数与三张例外表双向核对：前端更严格限制、尚未结构化的 Java 规则、纯前端策略。退回手抄整数、例外删改后没更新登记都会失败。

外加两条反空转断言：扫描必须真扫到 >300 个文件 / >200 个导出名，每个 owner 剥完注释后仍命中自己的形状。这两条是本门禁自己踩出来的——`sourceFiles()` 早版先判后缀再递归，只扫到 41 个顶层文件，四条规则全绿却是假绿。同一族还有一条按类名扫源码的：`packages/common/src/page-shell-width.test.ts`（见上面「布局」），它同样带反空转那一条。

新增一个共享概念时的顺序：先想清楚它该住哪（不依赖框架的逻辑进 `common`，要弹提示 / 格式化时间的进 `app-kit`，纯视觉的进 `ui-web`），落 owner，再把形状加进门禁的 `owners` 表。**放宽 allowlist 必须写明理由**（现有唯一一条：`AddressFormDialog` 的 `139********` 是「智能粘贴」输入框的占位示例文案，不产出掩码，也不与 `MASK_SEGMENT` 同形）。

## 前端测试（Vitest + Testing Library + MSW）

```bash
pnpm test            # 全量跑一次（vp test 的 vitest projects：apps/* + packages/*）—— 门禁与收尾才跑
pnpm test:watch      # watch 模式（开发默认挂这个）
pnpm test --project <名字> [路径...]   # 只跑某个 project（+ 可再按路径收窄），开发期首选
pnpm test --changed    # 只跑相对主干改动过的文件——分支离主干远时≈全量，见下
```

这些 script 多是 `vp test run …` 的包装（`test:related` 是 `vp test related`、`test:watch` 是 `vp test`）（Vite+ 内置 Vitest 5，仓库不再单独装 `vitest`）；
多数带 `--fs-module-cache`（见「迭代性能」），**唯独 `test:related` 不带**——实测把 `--fs-module-cache` 加到 `related` 后面会让它**静默解析不到依赖文件**（`related error-codes.ts` 不带 flag 跑 78 文件、带上变「No test files found / exit 0」，正是下面「related」那条假通过坑），别为了「一致性」补上。测试文件里 **import 一律来自 `vite-plus/test`**，
不是 `vitest`——`vite-plus/oxlint-plugin` 的 `prefer-vite-plus-imports` 会拦。
project 名字就是各 `vite.config.ts` 所在目录的包名：`web` / `seller` / `admin` /
`@shop/common` / `@shop/i18n` / `@shop/monitoring` / `@shop/client` / `@shop/app-kit` / `@shop/ui-web`。实测：

```bash
pnpm test --project @shop/common            # 12 文件 / 0.5s
pnpm test --project @shop/i18n              # 4 文件 / 0.15s
pnpm test --project @shop/monitoring        # 2 文件 / 0.13s
pnpm test --project @shop/client            # 3 文件 / 2.8s（拦截器全桩 fetch，慢在等计时器）
pnpm test --project web src/order           # 10 文件 / 5.2s（域内再收窄）
pnpm test:related <文件>                  # 24 文件 / ~19.5s（反查「谁引了它」，实测锚点 submit-form.ts）
pnpm test                                 # 全量 175 文件 / ~50–55s（门禁/pre-push 经 verify 分段缓存，开发期别默认它）
```

### 迭代性能：先量后调

全量 `pnpm test` 的瓶颈在「每个文件重新装配一遍模块图」——import 58% + environment 16% + setup 14%，`tests` 只占 7%。已开 `--fs-module-cache`（transform 桶 15% → 5%，Vitest 5 才有的开关，所有 project 共享一份产物，连冷跑都赢）；`pool: threads` 只省约 1s、`deps.optimizer` 实测完全无效，别再试。

**`isolate` 得写在各 project 自己的 `test` 块里，写在根配置上是死代码。** 根 `test.projects` 引用的是 config 文件，而「config 文件形式的 project 不继承根配置的任何 test 选项」——只有 inline project 才继承（web/seller/admin/ui-web/app-kit 里的 `unit`/`dom` 正是 inline project，所以它们上面那一层写一次就够）。这条此前一直没生效：从 `c0b66a99`（2026-09-29）起根配置就写着 `isolate: false`，而 2026-10-04 的全量日志结尾仍是 `Isolate 157 workers spawned`——157 个文件起了 157 个 worker，一文件一隔离。注释里那句「CI 上开隔离 337 s、关隔离 203 s」是**推算**（`d63625ba` 提交信息原文「推算换成数」），不是实测，别当既成事实引用。改成 per-project 后实测：本地全量 43 s 上下（关隔离 42.7 / 43.1 s，开隔离 43.6 s，差在噪声里），162 文件 / 1468 条全绿。**但 `isolate: false` 最终关回 `true`（2026-10-05）**：本仓库测试满是模块单例（SDK client、监控上报、locale 当前语言），同 worker 内前一个文件的状态会漏进后一个——本地核多把文件摊到不同 worker 看不出来，CI 2 核 runner 上实测串味（`configureSdkClient` 重复装配叠加拦截器 → 一条请求报两条 api 事件；dom 的 `setupFiles` 每文件重配 SDK、把只在模块首次求值时装配一次的 web `contextHeaders` 顶掉 → locale 落回默认 `zh-Hans-CN`）。那句「CI 337 s / 203 s」本就是推算、从没在 CI 验证过，关隔离的提速在 2 核 runner 上也兑现不了。结论：这套依赖模块单例的测试不适合共享 worker，保持 `isolate: true`；再想关，先让每个用到单例的测试自己 teardown 干净。代价提醒照旧：出现「单跑绿、全量红」先怀疑共享状态。

提速只有两条正路：

1. **少跑**（零成本，收益最大）：开发期挂 `pnpm test:watch`，或按 project + 路径跑 `pnpm test --project web src/order`。改一个域跑一个域。
2. **不加固定开销**：纯逻辑只用 Node，不加载 DOM/MSW setup。`.test.ts` 进 Node 是**默认**，只有三类要点名进 `domTests`：读写 `document.cookie` / `window.navigator` / `localStorage`、用 `@testing-library/react` 的 `renderHook`、依赖 `requestAnimationFrame` 这类真实浏览器 API。三个 project 已按同一口径拆开（`packages/common` 本来就是单 node 配置）。

> 改测试环境配置后**先 `rm -rf node_modules/.vite/vitest` 再下结论**。`--fs-module-cache` 的产物按配置指纹分目录，拆成子项目后目录名变了，旧缓存不会自动失效——实测不清理时 `@shop/app-kit` 凭空多出 26 条红（locale / provider / login-form 全军覆没），清完同一份代码全绿。这批红是缓存假象，别照着它去改业务代码。

另一条正交的路：**同一套门禁跑第二遍时不必重跑**。`pnpm exec vp run verify` 把 `vp check` / `pnpm typecheck` / `pnpm test` 串成一条，三段各自指纹缓存；**pre-push 的 `verify` 作业跑的就是这条**，所以本地手动验证与 push 前门禁同一条路径。源码/测试/配置/依赖任一变化照常失效，完全相同的状态直接重放。

**`cache.input` 里那两条 exclude 是承重的，别顺手删**：Vite Task 的 `auto: true` 输入集包含任务自己的产物，而 pnpm 每次跑都换名重写 `.pnpm-task-run-state-v1/.tmpXXXX`、Vitest 写 `.vite/vitest/<hash>/results.json`——于是「任务修改了自己的输入」，三段永远不命中。只排这两个具体路径，**不要排 `node_modules/**`**：那会把依赖变更一起排掉，装完新依赖仍重放旧绿，缓存就从加速变成说谎。

### CI：全量分到独立 runner，不关隔离

2026-10-06 的 [CI run 37489262120](https://github.com/gh885/shop/actions/runs/37489262120/job/112358070153)：单测 job **8m05s**，安装依赖 **6s**，Vitest **458.64s**（165 文件 / 1439 条通过，import 66%、tests 14%、environment 8%、setup 7%、transform 4%）。瓶颈是逐文件加载模块，不是依赖下载；本地 28 线程机器的几十秒不能当 CI 耗时。

- `frontend-test-shards` 用 4 个 runner 跑 `pnpm test --shard="$SHARD_INDEX/$SHARD_TOTAL"`，覆盖全量测试。`SHARD_TOTAL` 取 `strategy.job-total`，调整分片只改 matrix 的连续编号。Vitest 按文件分配，不手工按 app 分组；各 project 的 `isolate: true` 原样保留。
- `fail-fast: false` 让某片失败后其余片仍跑完。原 `frontend-test` 变成汇总门禁，保留 **前端单测（与 checks 并行）** 这个 required check 名，`if: always()` 确保上游失败也执行；只接受所有分片 `success`，失败、取消、跳过都不能放绿。不需要改分支保护。
- 本地复现一片：`pnpm test --shard=1/4 --maxWorkers=2`（换 `1` 为 `2/3/4` 可逐片跑）。日常 `pnpm test` 仍跑全量。4 片会重复安装依赖，增加 runner 总开销；目标是缩短等待，不承诺节省计费分钟。真实 CI 提速要等推送后实测，不能把原耗时直接除以 4 当结果。

2026-10-07 本地回归：Windows / Node 24.21.0 / 28 逻辑线程，每个进程限制 `--maxWorkers=2`，全量与各片使用独立的冷 `--fsModuleCachePath`。单进程全量 **190.58s**；4 片同时跑的总等待 **76.70s**（各片 76.59 / 64.63 / 73.76 / 68.27s）。JSON 报告逐文件、逐用例比对：**168 文件 / 1490 条全绿，4 片各 42 文件，无重复、遗漏或跳过**。这是用更多并行进程缩短等待的本机结果，不是 GitHub runner 的实测。

回滚：把原 `frontend-test` 恢复为直接执行 `pnpm test`，移除 `frontend-test-shards` 和汇总依赖；测试配置与本地命令不需要改。

### 两个坑：一个已修，一个还在

- `pnpm test:related <文件>`（即 `pnpm exec vp test related`，已建成 script）反查「谁引了它」，连 `#/` 别名一起解析得动（Vite+ 的 `tsconfigPaths` 解析让 `#/` 不再是瞎的）。它是条 dependable 的快路径（实测 ~19.5s / 24 文件）——注意**退出码 0 + 「No test files found」既可能是真的没人引它，也可能是你给错了路径，还可能是有人把 `--fs-module-cache` 补到了 `test:related` 上**（这 flag 会让 related 解析不到文件，见 §上面测试命令前言），先确认文件存在、再确认脚本没被加这 flag。
- **`--changed` 两个坑**：① 带基线时相对该 ref 算，分支离主干远就≈全量——实测 `--changed=HEAD~1` 在一个大提交上拉起 98 文件 / 47.65s，几乎没省（面一铺到 3 端就付不起 import）。② 不带基线的 `pnpm test --changed` 比的是**未提交改动**，**工作区干净时跑 0 个文件还 `exit 0`**——别把「啥也没跑」当成「通过」。

其余已知事实：

- **CI 里 `test` 已从 frontend job 的串行 step 拆成独立并行 job `frontend-test`**（无 `needs`，与 lint / typecheck / fallow 同时起跑）：wall-clock 取两者较大值而非相加；代价是 install 跑两遍，靠 setup-vp 依赖缓存摊薄。
- 慢的从来不是「测试体」：全量墙钟里 `tests` 桶只占 7%（39.8s 里约 2.8s），大头是 import / environment / setup。单文件也一样：`seller/coupon/CouponFormDialog.test.tsx` 自己 2.4s，但它在 `pnpm test --coverage`（7 个 project 并发 + V8 逐文件插桩）里能被拖到 14s——所以那条最重的用例显式写了 15s timeout，**不是因为它慢，是因为并发跑时 5s 默认线量到的是抢 CPU 的账**。别把全局 `testTimeout` 抬起来迁就它：别处真挂住就该 5s 就报。
- **不要为了「跑得快」把测试拆细或合并**——门禁的强度来自用例覆盖，39.8s 在 28 核上是可接受的；慢的正确做法是少跑，不是少测。
- 疑似 flaky 排查：`--changed` 跑法下曾偶发 1 例失败而全量连跑 3 次全绿（未定位到具体用例）。若再现，记下用例名再查，不要当成「配置问题」改配置。

### 分层与位置

- 纯逻辑单测（cart/order-status/money 等 `*.test.ts`，默认 node 环境）；组件/集成测试走 jsdom + Testing Library（`*.test.tsx`；少数需要浏览器语义的 `.test.ts` 在各 `vite.config.ts` 的 `domTests` 里点名，见「迭代性能」第 2 条）；server function 的真实行为交给 E2E（Playwright，仓库根 `e2e/`，`pnpm test:e2e`，CI 里跑下单主路径与发货物流链路）
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

**先量后改**，量法是 `pnpm perf:attrib`（Visualizer 的 treemap 看模块占比、network 查依赖路径），体积门禁执行 `pnpm perf:bundle`。别拿 import 形状当证据——但反过来，**「import 形状无关紧要」也只对了一半**，见下。

- **「barrel 挡住 tree-shaking」在 `packages/*` 不成立**：实测把 `packages/ui-web` 与 `packages/app-kit` 两个 barrel 改成调用点直连子模块，产物字节几乎没变（≈0），改动已回滚。那里 tree-shaking 本来就在工作。
- **它成立的地方是「有没有 `sideEffects` 声明」**。`packages/{api,ui-web,app-kit}` 早就各自带着，而**三个 app 的 `package.json` 一直没有**——于是从任何 barrel 引一个符号，就得把那个域里所有模块连同它们的依赖一起背上（打包器不能假定模块是干净的）。补上之后买家端首屏 **568KB → 332KB gzip**（预加载链接 63 → 40 个），卖家 / 管理端 ≈0（它们的首屏是登录页，本来就没引域 barrel）。app 侧写的是 `"sideEffects": ["*.css"]` 而不是 `false`：`main.tsx` 裸 `import "./styles.css"` 是真副作用，`false` 会把三端样式整份摇掉（web 用 `?url` 引样式，但三端保持同一个形状，别留一个例外等人踩）。
- **`lazy()` 不生效的那条边是 barrel**：同一个模块被静态引一次，动态引它就切不出块，Rolldown 直接印 `[INEFFECTIVE_DYNAMIC_IMPORT] <mod> is dynamically imported by A but also statically imported by B`。这条警告就是探测器——**构建里出现它，说明某个 `lazy()` 是白写的**。登录弹窗正是这个形状：`SiteHeader` 静态要 `logout`、`__root` 懒加载要 `LoginDialog`，同一个 `#/auth` 桶两头用，整条 `LoginForm → PhoneField → libphonenumber` 链（54KB gzip）就留在入口 chunk 里被每个页面预加载。做法是把**只有懒加载会用的导出留在桶外**（`#/auth/LoginDialog` 直连），桶里只留静态消费的符号。

历史记录（e6aebb6e + 上述修复，旧脚本的静态依赖统计，不代表当前页面实际加载量）：静态入口 JS `web/client` 332KB · `seller` 233KB · `admin` 214KB。原先挂在 TODO 的「Embla 落在 `/welcome` 也加载的共享 chunk」已随之消失（当时旧工具未在静态依赖集合中找到 embla；不能据此断言浏览器首屏不会加载它）。**zod 不是那条账**：`packages/api` 生成物 122KiB 是 raw 字节，落到首屏是 41KB gzip（运行时 30 + schema 11），而运行时那份是「契约漂移要能报警」的定价——按域拆 schema 入口最多拿回 11KB，不动。

## 自动修复：判据是门禁红绿，不是 warning 数

`vp fmt`（oxfmt）是纯格式化，幂等、可全仓跑。`vp check --fix` / `pnpm lint:web:fix` 除了格式化还连带跑 oxlint 的修复器。oxlint 把 fix 分 **safe / dangerous** 两档（设计见 [oxc#4211](https://github.com/oxc-project/oxc/issues/4211)）：safe fix「不改变程序行为」，dangerous fix 是「激进、可能改坏代码」的改动；**文档契约是 `--fix` 只应用 safe，dangerous 要显式 `--fix-dangerously`**。绝大多数 fix 是 safe 的——别把 `--fix` 一棍子打死，`vp fmt` 那种等价排版可以放心全仓跑。**但本仓库实测违反了这个契约**：随包的 oxlint 1.85.0 在**纯 `--fix`**（不带 `--fix-dangerously`）下就把一条官方标注为 ⚠️🛠️ dangerous 的规则 `unicorn/prefer-set-has` 应用了——见下。所以准确口径不是「fixer 类型不感知」，而是「`--fix` 会把 dangerous fix 泄漏进本该 safe-only 的路径」；这是 Vite+/oxlint 的 `--fix` 语义问题（`fixKind` 到底管哪档社区长期有争议，见 [oxc#19927](https://github.com/oxc-project/oxc/issues/19927)、[oxc-vscode#242](https://github.com/oxc-project/oxc-vscode/issues/242)），不是本仓库规则配错。口径：全仓 `--fix` 跑完必跟 `pnpm exec vp check` + `pnpm typecheck` + `pnpm test` 再决定留不留；已手动钉过的写法（如 `data-grid-cell-selection.tsx` 用 `.item()` 取末行）不要顺手改回去。

> **实证的 A/B（2026-10-03）**：对 `sdk-client.ts` 里 `const TOKEN_VERDICT_CODES: readonly string[] = [...]`（只被 `.includes` 用），强制开 `prefer-set-has` 后——A) `vp lint --fix`（无 `--fix-dangerously`）**照样**把它改成 `new Set([...])`、注解不动、调用点 `.includes`→`.has`；B) `vp lint --fix --fix-dangerously` 同样改。`tsc` 随即 `TS2740`（Set 不匹配 `readonly string[]`）+ `TS2339`（数组上没有 `.has`）。A 组证明 dangerous fix 泄漏进了 safe-only 的 `--fix`，即上面那句「违反契约」。历史那次全仓 fix（删 `as HTMLElement | null`、`x[len-1]`→NodeList 上没有的 `.at(-1)`、reui 造 6 error）是同一类：泄漏进来的都是 dangerous 档，不是 safe fix 本身有问题。

> **缓解与边界**：已把 `unicorn/prefer-set-has` 从**顶层配置关掉**（`packages/config/oxlint.config.ts`，判据同 `no-useless-type-assertion`——会改坏类型的 fix 一律 off），A 组实测第一方不再被它改坏。**关掉后重测**：再一次全仓 `pnpm exec vp check --fix` 产出干净树（`vp check` 0 error、`pnpm typecheck` exit 0）。但这**不等于 `--fix` 从此安全**——`--fix` 泄漏 dangerous fix 是版本行为，这一轮只是没别的危险规则命中而已。逐条关规则是打地鼠，真正的防线是 `verify` 链里 `vp check` 之后那道 `pnpm typecheck`：它不看 `--fix` 用了哪档，改坏编译就红。所以口径仍是「`--fix` 跑完必过 typecheck + test」，而不是「关掉 prefer-set-has 就能盲信」。

## 告警预算：warning 不参与门禁，所以更要能读

`vp check` 只有 error 才非零退出（实测 0 error / 618 warnings 时 exit 0），warnings 是暴露台账而不是拦子。台账的前提是**它能被读完**，所以 vendored 代码不参与：`packages/config/oxlint.config.ts` 的 reui override 除原先 13 条外，把风格/建议类整族（`unicorn/no-null`、`prefer-at`、`prefer-spread`、`eslint/no-shadow`、`typescript/no-*assertion*`、`react-doctor/no-giant-component` 等 31 条）对 `**/components/reui/**` 关闭。

- 效果：全仓 618 → **49 条 warning，且 100% 是第一方**（reui 命中数实测 0）。原先那 581 条来自 data-grid 与 cascader 两个 vendored 目录，改它就是 fork。
- 关掉的 31 条**全是 warn 级**（改前后 `vp check` 的 error 数恒为 0）。error 级规则对 reui 依旧生效（`typescript/no-floating-promises`、`unicorn/*-error` 那批、`tanstack-*`，加 tsc strict + `noUncheckedIndexedAccess`）；唯一的例外是原先那 13 条里就关掉的 `typescript/no-unnecessary-condition`，理由见上面的逐条注释。
- override 的 key 写错不报错、静默不匹配（同一族的坑见配置文件 :355-364 的 glob 注释）。所以改这块的规则后必须复跑 `pnpm exec vp check` 并数一遍 reui 命中数，别只看总 warning 数降没降。

### 卖家店铺守卫的路由时序

`ShopGate` 的无店铺白名单按 `useChildMatches` 中实际渲染的子路由判定，不按 `useLocation().pathname`。导航期间 location 可能已经指向店铺管理，而 Outlet 仍保留商品页；提前放行会让商品页失去 `ShopProvider`。首页的固定跳转放在 `beforeLoad`，不要与守卫在渲染期同时导航。

商品页没有读取配送报价时，只提示「配送费用以结算页为准」，不无条件承诺免运费或固定发货时限；具体收费由结算结果展示。
