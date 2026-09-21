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
- 依赖方向：`routes → domain → shared`；shared 不 import domain；domain 之间只经对方 `index.ts` 公开入口；跨端通用逻辑下沉共享包 —— 生成 SDK 在 `packages/api`，手写共享逻辑（money/api-error/forms/error-codes/auth-kit/sdk-client/category 树算法）一律归 `packages/common`，**禁止在 `@shop/api` 内新增手写文件**
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
- 表单：用 `useAppForm`（`@shop/ui-web`，TanStack Form + Zod validators），不手写裸 state 表单

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
4. **危险操作的二次确认走全局 `confirm()`（`@shop/ui-web`）**：`const ok = await confirm({ title, description, confirmText, action })`，与 `notify` 同级的全局收口——调用点不再持 `open` state、不铺弹窗骨架，根布局只挂一份 `<ConfirmDialogHost />`（与 `<Toaster />` 并排）。`action` 传 `mutation.mutateAsync(...)`：promise 期间确认按钮转圈，成功关面，失败保持打开等重试（错误提示已由全局 mutation 反馈弹过，这里不重复）。只在客户端事件回调里调，不要在渲染期/SSR 阶段调。

### 错误与重试：全部走官方边界，不自造 onRetry

**一句话**：失败态交给「谁渲染这一块」对应的官方边界，重试由边界的官方 reset 完成；`invalidateQueries` 只用于 mutation 之后的刷新，不再兼任重试。

`throwOnError: throwWhenNoData` 是 `createAppQueryClient()` 的**全局默认**，所以「失败抛给边界」是常态、不必逐条声明；**需要显式写的是退出**（`throwOnError: false`）。机制依据见 query-convergence.md §4。

| 失败范围                                                          | 交给谁                                            | 怎么接                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面主体数据（详情 / 列表 / 结算 / 收银台 / 工作台 / 店铺守卫）   | 路由 `errorComponent`                             | 什么都不用写：全局默认把错误抛给该 match 的 `CatchBoundary`，由三端 router 的 `defaultErrorComponent`（`RouteErrorFallback`）渲染；重试 = Router `reset()` + `QueryErrorResetBoundary.reset()` |
| 区块 / 弹窗内部件（店条、推荐流、首页 feed）                      | `QueryBoundary`（`@shop/app-kit`）                | 期望「整块替换」的用它：`pending` 骨架 + `fallback({ error, reset })`；suspense 查询自己会抛，非 suspense 查询靠全局默认抛到它的 `ErrorBoundary`（此时别传 `pending`）                         |
| 无边界可接的附属件（页头角标、收藏心形、可领券、弹窗/向导内部件） | 就地错误态                                        | options 写 **`throwOnError: false`** 退出全局默认，失败就地渲染 `isError` 并用官方 `refetch()` 重试（官方 manual 写法）                                                                        |
| 挂起                                                              | `pendingComponent` / `QueryBoundary` 的 `pending` | 路由级 `pendingComponent` 会被 Router 兼作该 match 的 Suspense fallback（见 `@tanstack/react-router` 的 `Match.js`），同时覆盖 loader 与 suspense 查询                                         |

写新查询时的五条硬规矩（完整机制依据见 query-convergence.md §4）：

1. **该抛才抛**（这条已内建为全局默认，别改成 `true`）：直接写 `true` 会在「有旧数据的后台刷新失败」时把一屏能看的内容换成整页错误页。
2. **退出默认的唯一判据是「头上有没有边界」**，不是「这份数据重不重要」。页头角标、收藏心形、可领券入口，以及消费方本就写「拿不到就不画这一块」的附属区块，都必须写 `throwOnError: false`——否则一个小挂件失败就炸掉整页。清单在各 options 的注释里。
3. **`enabled` / `placeholderData` / `skipToken` 与 suspense 互斥**：这类查询挂不了 `pending`，但仍然可以抛给一个不传 `pending` 的 `QueryBoundary`，或抛给路由 `errorComponent`。只有当它同时也没有边界时，才落回第 2 条的 `throwOnError: false` + `refetch()`。
4. **`useSuspenseQuery` 收不到 `throwOnError`**（类型里被 `Omit`，运行时被内部判据覆盖）：降级消费者要退出全局默认时，**必须在调用点写** `useQuery({ ...options, throwOnError: false })`，写在共享 options 里是静默失效。
5. **`QueryErrorResetBoundary` 必须在树里**（三端 Provider 树已挂，`QueryBoundary` 自带一层），否则重试按钮形同虚设。

## 金额（Money）

**一句话**：`Money { amount(分), currency }` 是链路上唯一的金额形状，「元」只活在输入框和展示文本里；运算和展示都不许脱离 Money，否则币种在那一刻就丢了。

| 要做的事           | 用什么（都在 `@shop/common` 的 `money.ts`）                                      | 不要                               |
| ------------------ | -------------------------------------------------------------------------------- | ---------------------------------- |
| 展示一笔钱         | `formatMoney(m, placeholder?)` / 共享 `Price` 组件（分段排版，符号跟币种）       | 各处手写 `¥${fenToYuan(m.amount)}` |
| 加减乘件数求和     | `plusMoney` / `minusMoney` / `timesMoney` / `sumMoney`（跨币种抛错，不静默相加） | `.amount` 抠出来做算术             |
| 表单回填           | `moneyToYuan(m)`（无符号、不分组、补齐两位）                                     | 拿 `formatMoney` 的结果塞进 input  |
| 元输入 → Money     | `yuanToMoney` / `yuanPriceSchema`（币种取 `PLATFORM_CURRENCY`）                  | 自己 `Number(v) * 100`             |
| 判两笔钱是否同一笔 | `sameMoney`（Money 是值对象，`===` 比的是引用）                                  | `a.price !== b.price`              |

- 缺席的钱显式给占位符（`formatMoney(undefined)` → `—`）：`¥0.00` 和「没有数」是两件事，前者会被读成免单。
- 造零值不凭空预设币种：`sumMoney` 非空时起点币种跟第一笔钱，`zeroMoney(currency)` 的币种从手上这批钱里拿。
- 不用契约生成的 `zMoney` 做校验收口：hey-api 把 `int64` 生成成 `z.coerce.bigint()`，输出 `bigint` 与 `Money.amount: number` 不兼容。
- 千分位分组固定在 `groupYuan`，不吃运行机器的区域设置（同一笔钱不该在中文 Windows 和控制台上长得不一样）。

## 前端测试（Vitest + Testing Library + MSW）

```bash
pnpm test        # 全量跑一次（vitest projects：apps/* + packages/*）
pnpm test:watch  # watch 模式
```

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
- 组件测试一律走 `renderWithProviders`（各 app `src/test/render.tsx`，挂独立 QueryClientProvider；需路由上下文只改这个文件），不裸用 `render`
- 查询用可访问性语义：`getByRole` / `getByLabelText`，禁 className 查询；label 文本必须纯净（必填星号走伪元素，不进 textContent）

### 什么测 / 什么不测

- **必测**：换算/状态机等决策逻辑（含边界与兜底）、wire→领域投影映射、表单流与请求体、bug 回归
- **不测**：纯类型、纯透传 re-export、zod schema 字段罗列（SDK 生成物自带校验）；快照测试一律不用
- **库行为不逐组件复制**：基建组件在其所在包测一次（如 `QueryBoundary` 的「失败 → 块级错误 + 重试」链路，见 `packages/app-kit/query-boundary.test.tsx`），业务组件不再复制同款三态用例；业务组件只测自己的差异化逻辑（如 `navTitle` 宽度预算截断）。纯展示型状态分支靠 business-rules 条目承载，值不上测试行数的不写
- 心智标准：这个分支里若藏着一个错的映射/反的布尔/漏掉的兜底，测试能不能红？能红才写

### 已知坑

- MSW handler path 必须写 `*/user/...` 通配形式（裸 `/user/...` 按 jsdom origin 解析，匹配不上 SDK 打到 8080 的请求）
- 要测「非 2xx 按 status 分支」的行为（如 404 = 没有记录），必须先在 app 的 `src/test/setup.ts` 里
  `configureSdkClient("http://localhost:8080")`：不装配时非 2xx 走 ky 自己的抛错路径（会预读 body），
  hey-api 解析时报 "Body is unusable"，调用方只拿到 `{status: 0}` 网络错误，404 分支永远测不到。
  baseUrl 必须是绝对地址——jsdom 的 `new Request()` 来自 undici，相对 URL（线上的同源 `""`）直接抛错。
  还要在 `beforeAll` 里**再压一次** `client.setConfig({ baseUrl: "http://localhost:8080" })`：
  测试文件 import 业务域时会连带 import app 的 `#/shared/**/api` 装配，那份按浏览器语义把 baseUrl 覆盖成 `""`，
  于是所有请求变成 status 0（`beforeAll` 在所有测试模块 import 之后才跑，所以这一压有效）
- 列表页的 hook 测试要先把登录态与店铺上下文造出来：seller 侧 `useMyShops` 只在 `authed` 时拉
  `/shops/mine`（测试里 `tokenStore.set("...")`，别忘 `afterEach` 里 `clear()`），
  `useCurrentShop` 解析出的 shopId 进缓存 key，没就位时失效的是另一棵树
- **app 测试不要自己 `new QueryClient()` / 用裸的 `createTestQueryClient()`**：全局 `throwOnError`、写操作的全局 toast 与 `meta.invalidates` 失效都挂在 `createAppQueryClient()` 的默认值上，裸 client 会让它们「生产里一定发生、测试里从不发生」。三端 `src/test/render.tsx` 导出的 `renderWithProviders` / `createAppTestQueryClient` 就是「应用真实默认值 + 禁 retry」，一律走它们；`@shop/test-utils` 的 `createTestQueryClient` 只留给 app-kit 自己测库行为用（它不 import app-kit，反向依赖会成环）。改这套默认值时要同步跑全量测试——`pnpm test` 里那几条「成功后三棵缓存一起失效」的用例正是靠它才生效的。
- pre-push 跑 `pnpm test`；admin 尚无用例，其 vitest 配置已开 `passWithNoTests`
