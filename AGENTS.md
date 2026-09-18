# Shop — 多店铺电商平台

## 技术栈

- 前端：TanStack Start (React 19), TypeScript 7, Vite 8, Tailwind v4, TanStack Query/Router
- 后端：Spring Boot 4.1, Spring Modulith 2.1, REST (OpenAPI), MyBatis-Plus 3.5, PostgreSQL 18, Redis 7
- 工具：Maven, pnpm, Lefthook, Oxlint/Oxfmt, Spotless (Google Java Format)

## 项目结构

```
shop/                    ← monorepo, 不用 monorepo 工具
apps/server/             ← Spring Boot 模块化单体, 不参与 pnpm workspace
apps/web/                ← 买家端 SSR
apps/seller/             ← 卖家工作台 SPA
apps/admin/              ← 平台管理端 SPA
packages/                ← 共享包（api / common / app-kit / ui-web / config / test-utils）
openapi/                  ← OpenAPI 契约（api-docs.json，由后端 /v3/api-docs 导出），packages/api 的 SDK 由 @hey-api/openapi-ts 从此生成（packages/api 内除 src/index.ts 聚合入口外全部是生成物）
```

## 关键架构规则

1. **模块隔离**：模块之间不 import 对方的 service/repo。模块间通信 = **api 包接口**（`@NamedInterface("api")`，查询与命令，同步同事务调用）+ **events 包事件**（`@NamedInterface("events")`，纯通知）。消费方在 `@ApplicationModule(allowedDependencies = …)` 显式登记
2. **Schema 隔离**：每个模块拥有自己的 PG schema（`product.products`）；跨 schema 只读按 ID 查询一律收进 owning 模块的 api 包（JdbcTemplate 只允许 infra.db 与各模块 api 包引用，ArchUnit 强制）
3. **不许跨 schema JOIN**
4. **`common/` 与 `infra/` 属于共享纯包**，不属于任何业务模块，无`@ApplicationModule`，经 `@Modulithic(sharedModules = {"common","infra"})` 显式登记为共享模块，任何模块可引用
5. **@Modulithic 强制校验模块边界**，测试期跨模块 import 直接报错

## 后端模块组织

```
server/src/main/java/com/shop/platform/
├── ShopServerApplication.java    ← @Modulithic(sharedModules = {"common","infra"})
├── common/                       ← 共享纯包：框架无关契约（异常体系、校验、UserIdHolder）
├── infra/                        ← 共享纯包：跨模块技术适配（JWT、Filter、MyBatis 配置）
├── account/                      ← 模块 = 顶层包 = PG schema
│   ├── package-info.java         ← @ApplicationModule（消费他模块时在 allowedDependencies 显式登记）
│   ├── controller/               ← REST 入口
│   ├── dto/                      ← HTTP 入参（XxxRequest / XxxQuery）
│   ├── service/                  ← 业务逻辑
│   ├── mapper/                   ← Entity + Mapper
│   ├── api/                      ← 可选：对外命名接口 @NamedInterface("api")，跨模块同步查询（XxxReadQuery）与命令（XxxCommand）
│   └── events/                   ← 可选：对外事件 @NamedInterface("events")，纯通知
├── product/
├── order/
└── …
```

- 模块内部结构：controller → service → mapper，三层到底
- 命名规范（三层契约）见 `apps/server/AGENTS.md`，由 ArchUnit 强制校验
- BO/Model 可选，不预创建空目录
- api/ 只在有跨模块同步调用需求时创建；events/ 只在需要跨模块纯通知事件时创建

## 常用命令

```bash
# 开发
pnpm dev              # 前后端同时启动
pnpm dev:server       # 后端（Spring Boot）
pnpm dev:web          # 买家端（Vite 开发服务器，3000 端口）
pnpm dev:seller       # 卖家工作台（独立 SPA，5000 端口）
pnpm dev:admin        # 平台管理端（独立 SPA，4000 端口）

# 检查
pnpm lint             # oxlint + mvn compile
pnpm format           # oxfmt + spotless:apply
pnpm typecheck        # 递归跑所有 workspace 包的 typecheck 脚本（pnpm -r --if-present）

# SDK 生成（需后端已启动）
pnpm gen:sdk          # 拉取 /v3/api-docs 覆盖 openapi/api-docs.json，重新生成 packages/api/src/sdk

# 构建
pnpm build            # vite build + mvn compile

# Java 单独
cd apps/server && mvn spotless:apply   # 格式化 Java
cd apps/server && mvn compile          # 编译检查
cd apps/server && mvn spring-boot:run  # 启动后端
```

## UI 组件库

组件库用 **shadcn/ui + BaseUI + Tailwind v4**，所有组件由 CLI 生成到 `packages/ui-web`，不手写。

### 添加组件

```bash
# 必须用 npx（pnpm dlx 会因 store 里 zod v4 冲突而报错）
# 注意：npm 11+ 会读根 package.json 的 devEngines，在项目目录内跑 npx 直接报 EBADDEVENGINES——
# 需先 cd 到项目外任意目录再执行，--cwd 用绝对路径指向 ui-web
"yes" | npx -y shadcn@latest add <component-name> --cwd /绝对路径/packages/ui-web
```

示例：

```bash
"yes" | npx -y shadcn@latest add button input dialog --cwd packages/ui-web
```

### 设计约定

- **视觉规则唯一来源：[`packages/ui-web/DESIGN.md`](packages/ui-web/DESIGN.md)**——使用铁律（复用优先/token 分层/primary 纪律）、色彩语义、形状海拔、动效、三端画像（web/seller/admin 差异走端级 Layer 2 覆盖 + 使用策略，不复制组件）都在那里；本文不重复维护
- 底层无样式组件：`@base-ui/react`（BaseUI），WAI-ARIA 合规
- 样式系统：Tailwind v4 + 分层主题 token（`packages/ui-web/src/styles.css`，数值真相源）
- 图标库：`lucide-react`
- 组件导出：`packages/ui-web/src/index.ts` → 各 app 直接 import

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

### App 接入 ui-web（如 apps/web）

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

- query hook → **失败交给错误边界，挂起就地渲染**：`throwOnError` 已是全局默认，页面主体数据失败由路由 `errorComponent` 接管，区块失败由 `QueryBoundary` 接管（见下节「错误与重试」）；只有**头上没有边界可接的查询**（页头角标、收藏心形、弹窗/向导内部件，或消费方本就写「拿不到就不画」的附属区块）才显式 `throwOnError: false` 并在组件里渲染 `isError`
- 派生态（如 empty：`data.length === 0`）→ 派生它的那一行所在组件
- mutation 错误 → 全局 `MutationCache` 按 `meta.error` 提示（渲染点在根部，已是产生点最近的消费者）；乐观态 → 缓存 patch 层（`optimisticListMutationOptions`），列表行只读缓存
- 组件内部瞬时状态（上传进度/提交中按钮）→ 留在组件内；出现第二个消费者才上提为域内 `use-*.ts`（与 hook 上提规则同构）
- route loader / `useSuspenseQuery` → 状态上移到 `pendingComponent`/`errorComponent`/Suspense 边界，父组件不再接触 query

分界线：往子组件传**状态标志**（`isPending`/`error` props）= 放错位置的味道——子组件被迫认识"状态是什么"，还会长出可空 props；传**处理后的结果**（`deriveXxx` 视图模型、骨架屏或数据二选一）= 干净——子组件只管"拿到什么画什么"。

## 服务端状态：query 的收敛口径

前提：TanStack Query **已经**是唯一的服务端状态通道（三端全量接入，route loader 一律经 Query 缓存取数，没有裸 fetch）。所以这里不是"要不要引入"的决策，而是"**这份数据该不该进 query**"与"**进哪个文件**"。

### 进不进 query：只有一条判据

**这份数据是否是需要保持一致的服务端副本**（会被写操作/别人改动，且有多处读或需跨路由留存）。

- 是 → 进 query。**不要**用 `useState`/zustand 存服务端实体，那等于手写缓存 + 手写失效；判据不是"几处读"（一个组件读也算，收益是免手写 loading 与去重），而是"它是不是副本"。注意区分**实体**与**实体之上的编辑会话**：`EditSkuDialog` 的行必须有本地 `useState`（要能改、要能提交前校验）——那是表单会话，本地草稿是唯一事实源；但**详情本身**必须来自 `productKeys.detail` 的 query（曾经这里自己拉一份详情存 state，于是弹窗改完 SKU、发布页看到的还是旧值）。
- 否 → 走 api/SDK 裸调或 mutation。典型：文件导出/下载、验证码、一次性提交（登录、反馈）、提交后即离开且无人读缓存的动作。
- **判据是「缓存这份数据有没有收益」，不是「它是不是服务端数据」**：陈旧值比转圈更糟（结算预览、智能解析）、副作用不可缓存（上传凭证、直传）、一次性会话（登录/刷新 token）、体积大不该进缓存（SSR 期间的流式响应）——这四类即使"是服务端数据"也不进 query。
- **404 不是「不进 query」的理由**：若已有「无数据」的合法 UI 表达（物流未发货 → 「暂无物流信息」），query + `retry: false` 就够（见 `logistics/queries.ts`）；只有当调用方要把 404 折叠成"没有"（售后单 → `null`）时才在 `queryFn` 里归一（见 `after-sale-queries.ts`）。真正该警惕的是**契约本身在"没有"与"出错"之间含糊**，那是后端要补语义，不是前端绕开 query 的借口。
- **写操作一律有接线**（全局反馈 + `meta` 声明），但**不是每个写操作都需要失效**：`meta.invalidates` 不传 = 显式声明"不改变任何已缓存查询"，不是漏写。失败要就地渲染在表单里（`meta.silentError`）、或终态才处理（登出用 `onSettled`）的，`meta` 照写、回调照用。判据与字段见下节「写操作」。

### 放哪个文件：key 归属 = 域，集中在域内 `queries.ts`

- **key 工厂集中在域内 `queries.ts`**（`productKeys` / `couponKeys` / `reviewKeys`…），一个域一棵树。key 散在组件或 `api.ts` 里 = 失效关系退化成"记在写代码的人脑子里"，新增读取方时没人会记得补失效点。
- **失效规则写在 mutation 旁边**（谁改数据，谁声明影响范围），不写在调用点。跨域连带失效也归进 mutation（下单后失效购物车 + 角标 + 我的订单）。
- **三端同形态的查询用 app-kit 的工厂，别复制**：`createAppQueryClient()`（默认值唯一真相源，读写两侧的全局默认都在里面）、`createMeQuery()`（当前登录者）、`MutationMeta`（写操作的声明面）。新增一个"三端都会写"的查询时，先问能不能把它变成工厂参数。
- **不造第二棵 key 树**：同一份服务端数据有两个 key = 两份缓存 + 两处失效，必然漂移（`useMe` 曾在三端各写一遍就是这形态）。发现即合并成一个 `xxxKeys`。
- **不用 `refetch()` 当刷新**：它绕过 staleTime 强制打网络，且把"谁改了数据"绑在持有该 query 实例的组件上。**刷新（数据变了）走 `invalidateQueries`（在 mutation 里）**；**错误态重试**是另一回事，见下节「错误与重试」——两套语义不要混。
- **loader 预取写 `queryClient.query({ ...options, staleTime: "static" })`，不用 `ensureQueryData`**：后者在 5.102 已废弃，官方给的替代口径就是这一句。语义正好是「有缓存就返回、没有才取数」——`fetchQuery` 走 `isStaleByTime('static')`，而它先判 `data === undefined` 再判 static，所以无缓存照样会取数（`ensureQueryData` 也是「无缓存即 fetch」）。这个 `staleTime` 只作用在这次 loader 读取上，不污染组件侧 observer 的新鲜度（`isStaleByTime` 用的是调用方自己那份 options，组件读的是 `xxxOptions`）。
- 领域组件（弹窗/卡片）**不 import query key**：只通过 `onSaved` 这类回调通知外层"数据变了"，由域内 `queries.ts` / `use-*.ts` 决定失效范围。回调名说"发生了什么"，不说"去做什么"（`onSaved` 而非 `invalidateList`）。
- **组件直接 `useQuery(xxxOptions)`，不给每个查询再包一层同名 hook**：`useHomeNav()` / `useOrderDetail(id)` 这类恒等透传只是给同一份东西起第二个名字（options 本来就得导出给 loader），且 hook 名看不出返回的是 `useQuery` 还是 `useSuspenseQuery`（`data` 的可空性不同）。
- **hook 只在携带决策时存在**。判定线：options 负责「取什么」，hook 负责「怎么用」，至少命中一条才值得包——
    - 叠 `enabled`（登录态 gating）：`useCartCount` / `useFavoriteStatus`
    - 换变体：调用点写 `useSuspenseQuery(feedOptions)`（这一条不需要 hook，变体写在调用点更显眼）
    - 派生/编排视图模型（多个 query + mutation + 导航/URL 状态合成一个给页面用的口）：`useOrderList` / `useRefundList` / `useProductList` / `useCartItemActions` / `useOrderActions` / `useCurrentShop` / `useLeafPaths`
    - 跨端同形态的写操作接线：`createMeQuery`
- **写操作不包 hook 工厂**：一律用库自己的 `useMutation`，反馈与失效经 `meta` 声明，由全局执行（见下节「写操作」——这是本仓唯一"不留包装"的一层）。
- **lint 兜底**：官方 `@tanstack/eslint-plugin-query` / `-router` 经 oxlint 的 `jsPlugins` 加载（配置与逐条理由见 `packages/config/oxlint.config.ts`）。`exhaustive-deps`（漏 key）、`stable-query-client`、`no-unstable-deps`、两条 property-order（`--fix` 可重排）、`route-param-names` 为 error；`no-rest-destructuring`、`prefer-query-options` 为 warn。官方 `no-void-query-fn` **未启用**：它靠 `parserServices.program` 取 TS 类型，oxlint 的 JS 插件 API 不提供（`--type-aware` 也无效，实测静默空转）。

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

为什么是这个形态（而不是各域包一层 `useXxxMutation`）：

- **官方对「mutation 该失效哪些 query」刻意不表态**。维护者 TkDodo 原话：_“Since there isn't a one-size-fits-all solution, React Query provides nothing out of the box”_（[Automatic Query Invalidation after Mutations](https://tkdodo.eu/blog/automatic-query-invalidation-after-mutations)）。但它把两个扩展点留了出来——**全局 `MutationCache` 回调**与**可用 `Register` 类型化的 `meta`**。两样都用：能全局的一律全局，逐点的只剩「这份回执改变了什么」。
- **反馈必须走全局，而不是逐点 `onError` 兜**：官方 `Mutation.execute` 里全局回调**先于**逐点回调（`mutation.ts` 的 onError 279 行 vs 291 行），所以「先拦住默认提示」只能靠全局读得到的声明。曾经逐点 `onError` 里再弹一条，结果是同一件事两条互相覆盖的提示（领券 409 就是这么坏的）。
- **没有 `useWriteMutation` 这类工厂**：它要自造 `messages` / `invalidateKeys` / `silentSuccess` 一套词汇，而库已经有 `meta`。「抽象的输入面贴着库自己的 API 走」是维护者 [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions) 的核心建议。乐观更新是唯一值得留包装的——它包的是一段顺序敏感的官方配方，且返回的是 options 对象而不是 hook。

`MutationMeta` 只有四个字段（`packages/app-kit/src/mutation-meta.ts`）：

| 字段          | 作用                                                           | 缺省行为                                                                |
| ------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `success`     | 成功提示文案                                                   | **不填即不提示**（「要不要提示」由有/无承载，所以没有 `silentSuccess`） |
| `error`       | 失败兜底文案                                                   | 后端 `detail` 优先，只有网络层错误（status 0）才用它                    |
| `silentError` | 该写操作自己渲染/吞掉错误（表单内联报错、会话终结）            | 一律弹全局失败提示                                                      |
| `invalidates` | 这份回执让哪些查询失效（**真实 query key**，前缀匹配一发命中） | 不失效任何缓存                                                          |

写新写操作时的三条硬规矩：

1. **`invalidates` 传真实 query key，不要发明 tag**：tag 表等于在 query key 之外再造一棵命名树，新增读取方时没人会记得补 tag（与「不造第二棵 key 树」同一条理由）；而且它表达不了「由变量算出的 key」——那种情况用库自己的 `onSuccess`。
2. **`silentError` 是显式声明，不是逃生舱**：只有「错误已经在别处被用户看见了」才用它（表单把 detail 渲染在字段下、登出后本地身份已清且人已在登录页）。
3. **乐观更新写 `useMutation(optimisticListMutationOptions({ ... }))`**：官方那三步（`onMutate` 取消在途 → 快照 → patch；`onError` 回滚；`onSettled` 失效）顺序写反了只在并发下偶发出错，所以固定在一次实现里，只把「怎么 patch」交给领域；反馈不在它里面（全局负责）。

### 错误与重试：全部走官方边界，不自造 onRetry

**一句话**：失败态交给「谁渲染这一块」对应的官方边界，重试由边界的官方 reset 完成；`invalidateQueries` 只用于 mutation 之后的刷新，不再兼任重试。

`throwOnError: throwWhenNoData` 是 `createAppQueryClient()` 的**全局默认**（判据：只在「一条数据都没有可展示」时抛，逐字等于官方给 suspense 用的内部默认），所以「失败抛给边界」是常态、不必逐条声明；**需要显式写的是退出**（`throwOnError: false`）。

| 失败范围                                                          | 交给谁                                            | 怎么接                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面主体数据（详情 / 列表 / 结算 / 收银台 / 工作台 / 店铺守卫）   | 路由 `errorComponent`                             | 什么都不用写：全局默认把错误抛给该 match 的 `CatchBoundary`，由三端 router 的 `defaultErrorComponent`（`RouteErrorFallback`）渲染；重试 = Router `reset()` + `QueryErrorResetBoundary.reset()` |
| 区块 / 弹窗内部件（店条、推荐流、首页 feed）                      | `QueryBoundary`（`@shop/app-kit`）                | 期望「整块替换」的用它：`pending` 骨架 + `fallback({ error, reset })`；suspense 查询自己会抛，非 suspense 查询靠全局默认抛到它的 `ErrorBoundary`（此时别传 `pending`）                         |
| 无边界可接的附属件（页头角标、收藏心形、可领券、弹窗/向导内部件） | 就地错误态                                        | options 写 **`throwOnError: false`** 退出全局默认，失败就地渲染 `isError` 并用官方 `refetch()` 重试（官方 manual 写法）                                                                        |
| 挂起                                                              | `pendingComponent` / `QueryBoundary` 的 `pending` | 路由级 `pendingComponent` 会被 Router 兼作该 match 的 Suspense fallback（见 `@tanstack/react-router` 的 `Match.js`），同时覆盖 loader 与 suspense 查询                                         |

写新查询时的五条硬规矩：

1. **该抛才抛**（这条已内建为全局默认，别改成 `true`）：直接写 `throwOnError: true` 会在「有旧数据的后台刷新失败」时把一屏能看的内容换成整页错误页。
2. **退出默认的唯一判据是「头上有没有边界」**，不是「这份数据重不重要」。页头角标、收藏心形、可领券入口，以及消费方本就写「拿不到就不画这一块」的附属区块（如 seller 待确认邀请是 `if (!data) return`），都必须写 `throwOnError: false`——否则一个小挂件失败就炸掉整页。清单在各 options 的注释里。
3. **`enabled` / `placeholderData` / `skipToken` 与 suspense 互斥**：这类查询挂不了 `pending`，但**仍然可以抛**给一个不传 `pending` 的 `QueryBoundary`，或抛给路由 `errorComponent`（列表带 `placeholderData` 就是这么做的）。只有当它同时也没有边界时，才落回第 2 条的 `throwOnError: false` + `refetch()`。
4. **`useSuspenseQuery` 收不到 `throwOnError`**：官方把它从 `UseSuspenseQueryOptions` 的类型里 `Omit` 掉了（`@tanstack/react-query` 的 `types.ts`），运行时也会用自己的内部判据覆盖。所以**内联**写 `useSuspenseQuery({ ...opts, throwOnError: false })` 是类型错误，而**传一个带 `throwOnError` 的 options 变量**（真实代码的写法）是**静默失效**。推论：`orderDetailOptions` 这类「页面主体走 suspense、另有降级消费者」的共享 options，**降级那一处必须在调用点写** `useQuery({ ...options, throwOnError: false })`——「这份数据在这里只是降级」属于调用点，不属于 options。
5. **`QueryErrorResetBoundary` 必须在树里**：suspense / 抛错查询失败后不重置它的标记，`retryOnMount` 会被官方强制为 false，重挂载不重取 —— 重试按钮形同虚设（三端 Provider 树已挂，`QueryBoundary` 自带一层）。这条在全局默认开启后**对所有查询生效**，所以第 2 条漏写一个就是一个「卡在错误页、怎么点都不回来」的角落。

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

## 开发规范

- 提交遵循 Conventional Commits：`<type>(<scope>): <subject>`（scope 可选）
- TypeScript 4 空格缩进，Java 遵循 Google Java Format AOSP 风格
- 所有金额用 `Money` 类型（amount + currency），不裸传 int64
- `pnpm dev:server` / `pnpm dev:web` 分别启动前后端
- `pnpm format` 同时格式化 TS 和 Java

## 错误码规范

**定义原则：只有当 HTTP status 不足以让前端区分处理逻辑时，才定义 error code。**

```
SSR（Spring Boot）：throw 时直接硬编码字符串，不维护常量类
TS（packages/common）：从 docs/error-codes.md 同步到 error-codes.ts

唯一真相源：docs/error-codes.md
```

**操作规则：**

1. 新建 code 必须先在 `docs/error-codes.md` 写清「前端行为」和「后端触发场景」
2. Java 侧直接写字符串：`throw new BusinessException(400, "SMS_CODE_EXPIRED", "验证码已过期")`
3. TS 侧同步到 `packages/common/src/error-codes.ts`
4. code 用 `SCREAMING_SNAKE_CASE`
5. 前端能用 status 区分的场景（401/403/404）不加 code
6. 会被前端 Zod 拦截的校验错误不加 code

## 包名

```
com.shop.platform       ← 后端主包
com.shop.platform.infra
com.shop.platform.account
…
```

## 数据库与 Redis（WSL2）

PostgreSQL 18 与 Redis 7 运行在 WSL2 上，不再用 Docker。Windows 侧通过 localhost 直连即转发到 WSL2。

数据库：`shop:shop_dev@localhost:5432/shop`
Redis：`localhost:6379`

### WSL 的 VM 按「会话」存活（后端突然连不上库就是这个）

WSL 的 VM 只按「有没有 WSL 会话」存活，没有会话时几十秒就把整台 VM 回收（本机实测 ~20s）。
VM 一停，Windows 侧 `127.0.0.1:5432` 的转发跟着消失，表现为两种假象：

1. 后端启动失败：`Unable to obtain connection from database: Connection to 127.0.0.1:5432 refused`
   （看着像数据库没起来，改 JDBC / 重启 PG 都没用）；
2. **更阴的**：后端已经跑起来也会变僵尸 —— Tomcat 还在 8080 接请求，但每个查库的接口都超时。

两条想当然的路都走不通（都实测过，别再试）：

- **网络流量不算会话**：后端跑着、每 20s 打一次查库接口，第二个请求就超时、VM 照停；
- **配置项靠不住**：`vmIdleTimeout=-1` 在本版本被接受但不生效，`instanceIdleTimeout` 是未知键，
  一次性 `wsl -e sh -c 'nohup sleep &'` 里的后台进程会随会话一起被拔掉。

所以只能用 Windows 侧的 `wsl.exe` 会话。但代价得认：VM 活着时 `vmmemWSL` 工作集约 **1.1–1.2GB**
（客户机里其实只用了 500 多 MB，其余是 VMM 与 page cache）。所以会话按需存在、用完即还：

```bash
pnpm dev:server   # 推荐：会话跟随后端进程 —— 后端停 / Ctrl-C 就释放内存
pnpm db:up        # 从 IDE 跑后端时用：拉起数据面 + 挂一个 detached 会话
pnpm db:down      # 立刻还内存：杀会话 + wsl --shutdown，并打印 vmmemWSL 前后占用
```

- 从 IDE 跑后端 / 跑 `mvn test`（测试连真库）前，先 `pnpm db:up`，用完 `pnpm db:down`；
- 强杀（`taskkill /F`、IDE 停止按钮、直接关终端）会留下 `wsl.exe … sleep infinity` 孤儿，
  它照样把 VM 按着，内存就回不去 —— 所以 `db:up` / `db:down` 都会按命令行把孤儿一起清掉
  （实现在 `scripts/ensure-datastore.mjs`，三种模式：默认 up / `--hold` / `--down`）；
- 换发行版用 `SHOP_WSL_DISTRO`，完全不挂会话用 `SHOP_WSL_KEEPALIVE=0`；
- 想彻底不占 VM 这份内存，只能把 PG/Redis 挪出 WSL（原生服务）—— 那就是另一套环境了。
