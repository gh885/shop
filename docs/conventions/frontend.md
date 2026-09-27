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
    - `constants.ts`：**展示文案 / 色板 / 动作表 / 页签**（纯数据，不 import 组件）。同一张表被 ≥2 个组件消费时必须收敛到这里——文案散在组件里必然漂移（同一个状态在卡上叫「交易成功」、在页签叫「已完成」）；规则（判定逻辑）仍留在 `xxx.ts`
    - **页签 / 下拉选项不是第二张表**：用 `@shop/common` 的 `statusOptions(表[, order])` 从状态表派生，一个状态只有一处中文（徽章与页签各写一份时「上架中」会漂移成「在售」）；文案与徽章色同表时合并成一张 `XXX_STATUS_META`（`{ label, variant }`），不设平行表——平行表要求每次加状态改两处，漏一处就得到「新状态没颜色」
    - 只有**角色措辞真的不同**时才各写一份（买家「待卖家处理」/卖家「待处理」是同一状态对两个人说两句活），并在表头注释写明这是决定而不是漏同步
- 依赖方向：`routes → domain → shared`；shared 不 import domain；domain 之间只经对方 `index.ts` 公开入口；跨端通用逻辑下沉共享包 —— 生成 SDK 在 `packages/api`，手写共享逻辑（money/api-error/forms/error-codes/auth-kit/sdk-client/category 树算法）一律归 `packages/common`，**禁止在 `@shop/api` 内新增手写文件**
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
- API 请求走 Vite proxy 同源（`/auth`、`/api`、`/user`、`/cart` → `localhost:8080`），浏览器端 baseUrl 用空串；SSR loader 里需绝对地址
- 登录态：`apps/web/src/lib/auth.ts`（access token 只存内存，refresh token 走后端 httpOnly cookie）
- 启动时 `bootstrapAuth()` 静默刷新（`lib/api.ts`），root 布局挂载处调用；受保护路由用 `beforeLoad: () => requireAuth()` 守卫，未登录自动拉起全局登录 Dialog
- 用户信息：`useMe()`（web 在 `account/queries.ts`、seller/admin 在 `shared/lib/me.ts`，三者都由 `@shop/app-kit` 的 `createMeQuery` 生成，未登录不发请求）
- 表单字段只放**用户输入的事实**：能从已填字段推出来的列不进表单。地址的省市区名就是这一类——表单只有 `regionCode`，三级名在 mutation 里按区划库现查（`packages/common/src/address.ts` 的 `regionNamesByCode`，口径见 ACC-81），级联字段 `RegionField`（`@shop/app-kit`）收和交也都只有这一个码。存两份的代价不是那三行 `setFieldValue`，是「界面看到的」与「落库的」各有权威、迟早分家
- 表单：用 `useAppForm`（`@shop/ui-web`，TanStack Form + Zod validators），不手写裸 state 表单。周边一并统一：校验放表单级 `validators.onSubmit`（不用字段级 onChange）；提交接线 `onSubmit={(e) => { e.preventDefault(); void form.handleSubmit() }}`；服务端/表单级错误用 `<FormError>`；弹窗表单体挂在 `DialogContent` 里（关闭即卸载、打开即按 props 重算默认值，不写 effect + `form.reset`）；页脚用 `DialogFooter`，取消按钮 `variant="outline"`，提交按钮 `{pending && <Spinner />}文字`、pending 读 mutation 的 `isPending`；弹窗内字段竖排、整页表单 label 左列（`orientation="horizontal"`）

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
- **lint 兜底**：官方 `@tanstack/eslint-plugin-query` / `-router` 经 oxlint 的 `jsPlugins` 加载，配置与逐条理由见 `packages/config/oxlint.config.ts`。

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

`MutationMeta` 只有四个字段（`packages/app-kit/src/mutation-meta.ts`）：

| 字段          | 作用                                                           | 缺省行为                                                                |
| ------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `success`     | 成功提示文案                                                   | **不填即不提示**（「要不要提示」由有/无承载，所以没有 `silentSuccess`） |
| `error`       | 失败兜底文案                                                   | 后端 `detail` 优先，只有网络层错误（status 0）才用它                    |
| `silentError` | 该写操作自己渲染/吞掉错误（表单内联报错、会话终结）            | 一律弹全局失败提示                                                      |
| `invalidates` | 这份回执让哪些查询失效（**真实 query key**，前缀匹配一发命中） | 不失效任何缓存                                                          |

写新写操作时的四条硬规矩：

1. **`invalidates` 传真实 query key，不要发明 tag**：tag 表等于在 query key 之外再造一棵命名树，新增读取方时没人会记得补 tag（与「不造第二棵 key 树」同一条理由）；而且它表达不了「由变量算出的 key」——那种情况用库自己的 `onSuccess`。
2. **`silentError` 是显式声明，不是逃生舱**：只有「错误已经在别处被用户看见了」才用它（表单把 detail 渲染在字段下、登出后本地身份已清且人已在登录页）。
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

## 金额（Money）

**一句话**：`Money { amount(分), currency }` 是链路上唯一的金额形状，「元」只活在输入框和展示文本里；运算和展示都不许脱离 Money，否则币种在那一刻就丢了。

| 要做的事            | 用什么（都在 `@shop/common` 的 `money.ts`）                                | 不要                               |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| 展示一笔钱          | `formatMoney(m, placeholder?)` / 共享 `Price` 组件（分段排版，符号跟币种） | 各处手写 `¥${fenToYuan(m.amount)}` |
| 加减乘件数求和      | `plusMoney` / `timesMoney` / `sumMoney`（跨币种抛错，不静默相加）          | `.amount` 抠出来做算术             |
| 表单回填            | `moneyToYuan(m)`（无符号、不分组、补齐两位）                               | 拿 `formatMoney` 的结果塞进 input  |
| 元输入 → Money      | `yuanToMoney` / `yuanPriceSchema`（币种默认平台定价币种 CNY）              | 自己 `Number(v) * 100`             |
| 判两笔钱是否同一笔  | `sameMoney`（Money 是值对象，`===` 比的是引用）                            | `a.price !== b.price`              |
| 比大小 / 取最低最高 | `compareMoney` / `minMoney` / `maxMoney`（跨币种抛错，空集合给 undefined） | `.amount < .amount`、自己写 reduce |
| 判这笔钱有没有值    | `isPositiveMoney`（优惠为 0、门槛为 0 都是「没有这一项」）                 | `m.amount > 0`                     |
| 划线价该不该画      | `strikethroughPrice(original, price)`（等于成交价就是不打折）              | 每个渲染点各判一次大小             |

- 缺席的钱显式给占位符（`formatMoney(undefined)` → `—`）：`¥0.00` 和「没有数」是两件事，前者会被读成免单。
- 造零值不凭空预设币种：`sumMoney` 非空时起点币种跟第一笔钱，`zeroMoney(currency)` 的币种从手上这批钱里拿。
- 不用契约生成的 `zMoney` 做校验收口：hey-api 把 `int64` 生成成 `z.coerce.bigint()`，输出 `bigint` 与 `Money.amount: number` 不兼容。
- 千分位分组固定在 `groupYuan`，不吃运行机器的区域设置（同一笔钱不该在中文 Windows 和控制台上长得不一样）。

## 共享词表：一个概念一个出口

**一句话**：一个概念在前端只许有一个出口，且那个出口住在它该住的包里；「另一处也这么写」不是复制的理由，是把它请进 owner 的理由。

后端用 `ValidationVocabularyTest` 钉住「一条规则一个具名常量」，前端此前只靠人记得住。记不住的三份现场证据：

- `apps/web` 里 `DeletionDialog` 从 `@shop/app-kit` 导入 `useCountdown`（相对秒数递减），同 app 的 `OrderCard` 从本地 `#/shared/lib/use-countdown` 导入同名 hook（按绝对时刻倒数）——**同名不同义**，跨文件复制粘贴会静默换语义。后者已改名 `useDeadline`。
- `apps/seller/src/layout/Sidebar.tsx` 是个只转发的包装，却和 `@shop/ui-web` 的 `Sidebar` 重名——本地能 import 到的那个遮蔽了包里的那个。包装已删，`AppShell` 直接用 `WorkbenchSidebar`。
- 同一张卡片上「已售 1234」和「1.2千人收藏」并存：销量只折万、收藏多一条千位折档，**同一个数两种读法**。折万算式收进 `compactCount` 后收藏数弃用了千档。

| 概念         | 唯一出口                                                                                      | 落在哪                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 手机号掩码   | `maskPhone` / `MASK_SEGMENT`（`mask.ts`）                                                     | `@shop/common`；`ui-web` 的 `MaskedValue` 持同形常量                                                                                                |
| 大数折万     | `compactCount`（`count.ts`）                                                                  | `@shop/common`                                                                                                                                      |
| 复制 + 反馈  | `copyWithNotify`（`copy-text.ts`）                                                            | `@shop/app-kit`（要弹 toast，属展示胶水）                                                                                                           |
| 金额         | `money.ts` 一族（见上一节）                                                                   | `@shop/common`                                                                                                                                      |
| 地址字段口径 | `ADDRESS_NAME_MAX` / `ADDRESS_DETAIL_MAX` / 三个 schema（`address.ts`）                       | `@shop/common`；数字的对端在 Java `common/AddressFieldRules`                                                                                        |
| 运单字段口径 | `CARRIER_NAME_MAX` / `TRACKING_NO_MAX` / `TrackingNoSchema`（`tracking.ts`）                  | `@shop/common`；数字的对端在 Java `common/TrackingFieldRules`（承运商 code 不镜像：它不是用户输入）                                                 |
| 商品字段口径 | `PRODUCT_NAME_MAX` / `SELL_POINT_MIN` / `SELL_POINT_MAX` / 两个 schema（`product-fields.ts`） | `@shop/common`；对端在 Java `product.dto.ProductFieldRules`，含提示语逐字节相同                                                                     |
| 规格取值口径 | `SPEC_VALUES_MAX` / `SPEC_VALUE_MAX`（`product-fields.ts`）                                   | `@shop/common`；两条对端不同——条数在 `product.dto.ProductFieldRules`，取值文本在 `product.dto.CategoryFieldRules`（自定义取值以此文本建档进那一列） |
| 备注字数预算 | `NOTE_MAX`（`note-fields.ts`）                                                                | `@shop/common`；对端在 Java `common/NoteFieldRules`——买卖家备注、售后理由、运营补录轨迹描述等七个入参共用这一份预算                                 |
| 券名口径     | `COUPON_NAME_MAX` / `COUPON_NAME_MESSAGE`（`coupon.ts`）                                      | `@shop/common`；对端在 Java `coupon.dto.CouponFieldRules`，提示语由数字派生                                                                         |
| 地址标签     | `ADDRESS_LABEL_MAX`（`address.ts`）                                                           | `@shop/common`；对端在 Java `common/AddressFieldRules`，app 侧可更严（见下面第 5 条）                                                               |
| 登录手机号   | `PHONE_PATTERN` / `PHONE_DIGITS`（`login-schema.ts`）                                         | `@shop/app-kit`；位数与形状谁改都当场红（门禁第 5 条互推）                                                                                          |
| 错误码       | `ErrorCodes`（`error-codes.ts`）                                                              | `@shop/common`；对端在 Java `common.ErrorCodes` 与 `docs/error-codes.md`，三边由 `ErrorCodeVocabularyTest` 核对，前端不另立码                       |
| CMS 定位值   | `CMS_TARGET_MAX` / `CMS_URL_MAX`（`apps/admin/src/cms/constants.ts`）                         | **app 本地** owner：只有 admin 三页用，不必进 `common`；对端在 Java `cms.dto.CmsFieldRules`                                                         |

凡写着「对端在 Java …」的行都不归下面这个门禁管：它们是**跨语言**的等式（TS ↔ Java ↔ 已发布契约 ↔ 迁移列宽），由后端的 `FieldRuleVocabularyTest`（数字那一族）与 `ErrorCodeVocabularyTest`（错误码那一族，另核每处抛码站点的状态码与「谁在读」列）核对——前端门禁只能扫到前端，用它守三边相等会永远绿。

**门禁**：`packages/common/src/shared-vocabulary.test.ts`（node 环境，扫 `apps/*/src` + `packages/*/src` 全部源码），五条规则各挡一种漂移：

1. **app 不遮蔽包导出**——app 本地导出的符号名不得与 `packages/*` 的导出名相同
2. **形状的写法只有一份**——`****` / `/ 10000` / `navigator.clipboard.writeText` 这些字面量只许出现在 owner 文件里（判定在**剥掉块注释**后的文本上做：注释里写 `138****0000` 是给人看的示例，不是第二份实现；行注释不剥，宁可误报不空转）
3. **owner 之间不漂移**——`ui-web` 刻意零内部依赖（纯 UI 包），它的 `MASK_SEGMENT` 必须与 common 的那份**逐字节相等**；常量等式编译期查不了，测试期钉
4. **owner 不是孤儿**——每个 owner 至少有一个真实调用点，且聚合入口 `src/index.ts` 的 re-export 不算调用点
5. **一个概念不许各说一半**——同一件事写成两个数时（位数 `PHONE_DIGITS` 与正则 `1[3-9]\d{9}`、上限 `CONTACT_PHONE_MAX` 与正则 `{5,20}`），后者的长度由源码解析出来与前者的值比对，改一个忘另一个当场红。app 侧自设的上限只许**等于或严于**契约，严于必须在表里登记理由（如自定义标签 4 字而契约 20 字：chip 只显示四个字）。判据按**概念**索引，不按数字索引——`64 / 30 / 6 / 200` 这些数在互不相干的概念里撞车，按数字扫会把门禁做成噪音。**「必须在表里登记」从今天起不是靠记得**：`FieldRuleVocabularyTest.前端数值边界只许登记成三种对边之一`（GEN-64）扫六根全部 `const X = <整数>` 形状的具名数值边界，两向必须等于三张登记表的并集——新建一个不登记会红，把已登记的改名或换成算式也会红（清单自己烂掉这件事同样得红）。三种对边：契约镜像、Java 词表同值、以及「这就是我这一处的策略」（`MAX_AUTO_PAGES` / `RETRY_LIMIT` 这类后端根本不读的数，登记时必须写理由）。

外加两条反空转断言：扫描必须真扫到 >300 个文件 / >200 个导出名，每个 owner 剥完注释后仍命中自己的形状。这两条是本门禁自己踩出来的——`sourceFiles()` 早版先判后缀再递归，只扫到 41 个顶层文件，四条规则全绿却是假绿。

新增一个共享概念时的顺序：先想清楚它该住哪（不依赖框架的逻辑进 `common`，要弹提示 / 格式化时间的进 `app-kit`，纯视觉的进 `ui-web`），落 owner，再把形状加进门禁的 `owners` 表。**放宽 allowlist 必须写明理由**（现有唯一一条：`AddressFormDialog` 的 `139********` 是「智能粘贴」输入框的占位示例文案，不产出掩码，也不与 `MASK_SEGMENT` 同形）。

## 前端测试（Vitest + Testing Library + MSW）

```bash
pnpm test            # 全量跑一次（vitest projects：apps/* + packages/*）—— 门禁与收尾才跑
pnpm test:watch      # watch 模式（开发默认挂这个）
pnpm test:project <名字> [路径...]   # 只跑某个 project（+ 可再按路径收窄），开发期首选
```

project 名字就是各 `vitest.config.ts` 所在目录的包名：`web` / `seller` / `admin` /
`@shop/common` / `@shop/app-kit` / `@shop/ui-web`。实测：

```bash
pnpm test:project @shop/common            # 14 文件 / 2.2s
pnpm test:project web src/order           # 10 文件 / 10.4s（域内再收窄）
```

### 迭代性能：先量后调，且别调那几个没用的旋钮

全量 `pnpm test` 实测 **39s / 87 文件 / 694 用例**（28 核，已高度并行）。这已经是当前结构的地板附近，**下面三个提速旋钮实测全是 0 收益，不要再花时间试**：

| 旋钮                                                  | 实测                 | 结论            |
| ----------------------------------------------------- | -------------------- | --------------- |
| `pool: "threads"`                                     | 13.5s → 12.3s        | 省约 1s，不值当 |
| `isolate: false`（复用模块注册表）                    | 13.46s，**完全没变** | 无效            |
| `deps.optimizer.ssr.include` 预打包 `@shop/api`/`msw` | 13.4s，**完全没变**  | 无效            |

**为什么调不动**：一个空测试文件的地板就是 **1.23s**（`setupFiles` 673ms + jsdom 环境 397ms）——
`packages/app-kit/test/setup.ts` 每个文件都要 import 整个 `@shop/api` SDK + MSW。
87 文件 × 约 1.3s ≈ 113s 固定成本，被 28 个 worker 并行摊完即 39s。
**瓶颈是「每文件固定开销」，不是配置没调对**；配置层最多再省 5s。

因此提速只有两条正路，按性价比排序：

1. **少跑**（零成本，收益最大）：开发期挂 `pnpm test:watch`，或按 project + 路径跑 `pnpm test:project web src/order`。改一个域就跑一个域，不要每次全量。
2. **不加固定开销**：新测试默认放**离它最近的环境**——纯逻辑进 `packages/common` 那种 node 环境的 `.test.ts`；只有真的要 render/DOM/发请求的才写 `.test.tsx` 拖 jsdom + MSW。
   纯逻辑测试塞进 jsdom 项目（`apps/*` 的 `.test.ts`）也能跑，但它白白摊一份 1.2s 的固定成本，且误导后来人以为它需要 DOM。

### 两个别踩的坑（都是实测，不是推测）

- **`vitest related <文件>` 在本仓库不可靠，会静默返回「No test files found」**：它靠 Vite 模块图反查，而 app 内测试大量走 `#/` 别名 import（`use-order-actions.ts` 就查不到任何用例，退出码仍是 0 —— 看着像「没东西要跑」，实际是漏跑）。`related` 只在源文件被跨包广泛 import 时才有效（如 `common/src/money.ts` 会拉起 57 个文件，那也基本等于全量）。**按 project + 路径过滤才是 dependable 的快路径。**
- **`--changed` 是相对主干算的**：本仓库当前分支离主干较远，它实测仍会拉起全部 87 个文件（≈全量的时间），只在「分支短且已 rebase」时才有意义。

其余已知事实：

- 慢的从来不是「测试体」：文件耗时里 import + setup 占大头，`tests` 聚合只占 55s/全量 39s 墙钟。某个文件 9s（`seller/coupon/CouponFormDialog.test.tsx`）几乎全是它 import 的那棵业务树，不是它自己的用例。
- **不要为了「跑得快」把测试拆细或合并**——门禁的强度来自用例覆盖，39s 在 28 核上是可接受的；慢的正确做法是少跑，不是少测。
- 疑似 flaky 排查：`--changed` 跑法下曾偶发 1 例失败而全量连跑 3 次全绿（未定位到具体用例）。若再现，记下用例名再查，不要当成「配置问题」改配置。

### 分层与位置

- 纯逻辑单测（cart/order-status/money 等 `*.test.ts`）；组件/集成测试走 jsdom + Testing Library（`*.test.tsx`）；server function 的真实行为交给 E2E（Playwright，未接入）
- **测试文件与被测模块同目录、同名**（`xxx.ts` → `xxx.test.ts`），不建 `__tests__`/`test/` 用例目录；`src/test/` 只放跨模块测试装置（setup/render），共享 handler 与假数据进 `packages/test-utils`
- vitest 显式导入（不开 globals）；route 文件保持薄，业务逻辑放独立模块才可单测

### 怎么写

- 一个测试只讲一件事：Given / When / Then，标题说**行为与后果**（含理由：`下架 ≠ 缺货`、`PAID → pending_shipment`），不用函数名当标题
- 断言可观察后果（错误文案、弹窗关闭、请求体），不断言渲染次数/内部 state（React Compiler 自动 memo，渲染计数断言必碎）；形状断言用 `toMatchObject` 聚焦关心字段
- 异步等确定性信号：`userEvent.setup()` + `findBy*/waitFor`，禁止 `sleep()` 凑时间
- 夹具：测试文件内 `makeXxx(overrides)` 工厂（默认值 + 只暴露该测试关心的维度），不做跨文件共享的可变 fixture；契约级假数据（`makeAddress` 等）进 test-utils，且**必须过 SDK zod schema**（连 UUID 格式都校验）
- 改 bug 先写复现测试再修

### 网络与渲染约定

- **只 mock HTTP 网络层（MSW），禁止 `vi.mock` 业务模块/内部函数**——mock 实现会让测试跟实现绑死
- 默认 handler 集中在 `packages/test-utils`，按 openapi 契约 mock；用例内用 `server.use(http.xxx(...))` 局部覆盖并捕获请求体，断言「业务形状 → wire 形状」投影（如 receiver → receiverName）
- 组件测试一律走 `renderWithProviders`（`@shop/app-kit/test`，三端统一薄包装，挂独立 QueryClientProvider；需真实路由上下文的用同处的 `renderWithRouter`），不裸用 `render`
- 查询用可访问性语义：`getByRole` / `getByLabelText`，禁 className 查询；label 文本必须纯净（必填星号走伪元素，不进 textContent）

### 什么测 / 什么不测

- **必测**：换算/状态机等决策逻辑（含边界与兜底）、wire→领域投影映射、表单流与请求体、bug 回归
- **不测**：纯类型、纯透传 re-export、zod schema 字段罗列（SDK 生成物自带校验）；快照测试一律不用
- **库行为不逐组件复制**：基建组件在其所在包测一次（如 `QueryBoundary` 的「失败 → 块级错误 + 重试」链路，见 `packages/app-kit/query-boundary.test.tsx`），业务组件不再复制同款三态用例；业务组件只测自己的差异化逻辑（如 `navTitle` 宽度预算截断）。纯展示型状态分支靠 business-rules 条目承载，值不上测试行数的不写
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
- pre-push 跑 `pnpm test`；各 app 的 vitest 配置都不开 `passWithNoTests`：用例被误删要能被 CI 发现

## 打包体积（判据是产物，不是 import 形状）

「barrel（`index.ts` 汇总出口）挡住 tree-shaking」在本仓库不成立：实测把 `packages/ui-web` 与 `packages/app-kit` 两个 barrel 改成调用点直连子模块，产物字节数几乎没变（≈0），改动已回滚。要动体积，顺序只能是**先量后改**——`pnpm build` 后看 `dist` 里每个 chunk 归属谁（产物可视化或 `--sourcemap`），别拿 import 形状当证据。

量到的现状：Embla（约 45KB raw）落在 `/welcome` 也会加载的共享 chunk 里，欢迎页首屏 JS 1.37MB raw / 418KB gz。把它挪出共享 chunk 需要在商详页给图库位加 `lazy` + Suspense 骨架，属可感知的行为变化，是否值得另判（挂在 TODO）。
