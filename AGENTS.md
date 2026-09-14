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
pnpm typecheck        # tsc --noEmit

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
- 用户信息：`useMe()`（`lib/me.ts`，TanStack Query 缓存，未登录不发请求）
- 表单：用 `useAppForm`（`@shop/ui-web`，TanStack Form + Zod validators），不手写裸 state 表单

## 状态归属（前端）

原则：**状态在哪里产生（最先可观测），就在最近的消费者处理它**。可观测点由取数机制决定，不机械绑定组件层级：

- query hook → 调用处组件：`isPending`/`isError` 就地渲染 loading/error 态，不往下传
- 派生态（如 empty：`data.length === 0`）→ 派生它的那一行所在组件
- mutation 错误 → `onError` 即 `notify.fromError`（toast 的渲染点在根部，已是产生点最近的消费者）；乐观态 → 缓存 patch 层（`useOptimisticListMutation`），列表行只读缓存
- 组件内部瞬时状态（上传进度/提交中按钮）→ 留在组件内；出现第二个消费者才上提为域内 `use-*.ts`（与 hook 上提规则同构）
- route loader / `useSuspenseQuery` → 状态上移到 `pendingComponent`/`errorComponent`/Suspense 边界，父组件不再接触 query

分界线：往子组件传**状态标志**（`isPending`/`error` props）= 放错位置的味道——子组件被迫认识"状态是什么"，还会长出可空 props；传**处理后的结果**（`deriveXxx` 视图模型、骨架屏或数据二选一）= 干净——子组件只管"拿到什么画什么"。

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
