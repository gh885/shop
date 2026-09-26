# Shop — 多店铺电商平台

## 技术栈

- 前端：TanStack Start (React 19), TypeScript 7, Vite 8, Tailwind v4, TanStack Query/Router
- 后端：Spring Boot 4.1, Spring Modulith 2.1, REST (OpenAPI), MyBatis-Plus 3.5, PostgreSQL 18, Redis 7
- 工具：Maven, pnpm, Lefthook, Oxlint/Oxfmt, Spotless (Google Java Format)

## 项目结构

```
shop/                    ← monorepo（pnpm workspace + catalog；除 workspace 外不上 turbo/nx）
apps/server/             ← Spring Boot 模块化单体, 不参与 pnpm workspace
apps/web/                ← 买家端 SSR
apps/seller/             ← 卖家工作台 SPA
apps/admin/              ← 平台管理端 SPA
packages/                ← 共享包（api / common / app-kit / ui-web / config / test-utils）
openapi/                  ← OpenAPI 契约（api-docs.json，由后端 /v3/api-docs 导出），packages/api 的 SDK 由 @hey-api/openapi-ts 从此生成（packages/api 内除 src/index.ts 聚合入口外全部是生成物）
docs/                     ← 架构 / 约定 / 决策 / 调研（索引见 README「文档地图」）
```

## 常用命令

```bash
# 开发
pnpm dev              # 前后端同时启动
pnpm dev:server       # 后端（Spring Boot）
pnpm dev:web          # 买家端（Vite 开发服务器，3000 端口）
pnpm dev:seller       # 卖家工作台（独立 SPA，5000 端口）
pnpm dev:admin        # 平台管理端（独立 SPA，4000 端口）

# 造数（仅本地 shop 库，只增不改人工数据）
pnpm seed:demo        # 灌演示店/买家/券/运费/活单等浏览器可流转场景（scripts/seed-demo.mjs，二次运行幂等）
node scripts/seed-demo.mjs --dry-run   # 只打印将执行的 SQL

# 检查
pnpm lint             # oxlint + mvn compile
pnpm format           # oxfmt + spotless:apply
pnpm typecheck        # 递归跑所有 workspace 包的 typecheck 脚本（pnpm -r --if-present）
pnpm test             # 前端全量测试（vitest projects：apps/* + packages/*）
pnpm fallow           # 死代码 + 架构边界（域间只走对方 index.ts，规则见 frontend.md）
pnpm fallow:audit     # 只审当前改动，恒退 0：告诉你这个 diff 该往哪盯
                      # 去掉 --brief 的 `pnpm exec fallow audit` 是门禁（pre-commit / PR CI）：新引入的死代码、超标复杂度、重复代码才拦

# SDK 生成（需后端已启动）
pnpm gen:sdk          # 拉取 /v3/api-docs 覆盖 openapi/api-docs.json，重新生成 packages/api/src/sdk，末尾跑 contract:audit

# 构建
pnpm build            # vite build + mvn compile

# Java 单独
cd apps/server && mvn spotless:apply   # 格式化 Java
cd apps/server && mvn compile          # 编译检查
cd apps/server && mvn spring-boot:run  # 启动后端
```

## 规范在哪（动对应代码前先读）

| 你要动的东西                                           | 必读                                                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 后端（apps/server）：架构规则、模块组织、命名、测试    | `apps/server/AGENTS.md`（本目录自动加载）                                                                                                          |
| 前端（`apps/*`、`packages/*`）：目录、状态、取数、测试 | [docs/conventions/frontend.md](docs/conventions/frontend.md)；改取数条款前先读其论证 [query-convergence.md](docs/conventions/query-convergence.md) |
| 国际化 i18n：Locale 模型、文案资源、错误文案、落地路线 | [docs/conventions/i18n.md](docs/conventions/i18n.md) |
| UI / 视觉 / 加组件                                     | [packages/ui-web/DESIGN.md](packages/ui-web/DESIGN.md)                                                                                             |
| 架构总览、模块依赖图、关键链路、全库 ID 与金额策略     | [docs/architecture.md](docs/architecture.md)                                                                                                       |
| 业务规则（订单/券/物流/售后/支付/账号…的生效规则清单） | [docs/business-rules/](docs/business-rules/)（逐条带编号；改代码里的规则要同步改对应条目）                                                         |
| 当前进行中的事                                         | [TODO.md](TODO.md)                                                                                                                                 |

## 高频硬规则速览（细则与完整版见上表对应文件）

- **Money**：金额全链路只有一个形状 `Money { amount(分), currency }`——DB 存 `(amount, currency)` 列对 + `CHECK (currency='CNY')`，Java / OpenAPI 契约 / TS 同名同形，不裸传 int64；运算与展示都不脱离 Money（前端展示只走 `formatMoney` / 共享 `Price`，符号跟币种，不各处手写 `¥${fenToYuan(m.amount)}`）。编译期门禁见 `MoneyTypeRulesTest`：契约层金额字段必须是 Money、币种列只允许出现在 mapper 实体与 Money 里
- **后端**：模块间只走 api 包同步调用或 events 事件，不 import 对方 service/repo；不许跨 schema JOIN；跨 schema 裸 SQL 只允许 infra.db 与各模块 api 包
- **前端取数**：TanStack Query 是唯一服务端状态通道，不裸 fetch；key 工厂集中域内 `queries.ts`，不造第二棵 key 树；loader 预取用 `query({ ...options, staleTime: "static" })`
- **前端写操作**：库 `useMutation` + `meta`（success/error/silentError/invalidates）声明，反馈与失效由全局 MutationCache 执行，不包 hook 工厂，`invalidates` 传真实 query key
- **前端错误态**：`throwOnError` 全局默认 `throwWhenNoData`（失败抛给边界）；只有头上没有边界可接的查询才显式 `throwOnError: false` 就地渲染
- **前端测试**：MSW 只 mock 网络层（禁 `vi.mock` 业务模块）；组件测试走各 app 的 `renderWithProviders`（应用真实 QueryClient 默认值），不裸 `new QueryClient()`
- **Tailwind 跨包**：给 ui-web / app-kit 加带类名的组件时，确认三端 `styles.css` 的 `@source` 已覆盖（漏了是静默掉样式，不报错）
- **共享逻辑**：手写共享逻辑一律 `packages/common`，禁止在 `@shop/api` 内新增手写文件（那里全是生成物）；一个概念在前端只许有一个出口，由 `packages/common/src/shared-vocabulary.test.ts` 门禁钉住（详见 `docs/conventions/frontend.md`「共享词表」）

## 开发规范

- 提交遵循 Conventional Commits：`<type>(<scope>): <subject>`（scope 可选）
- TypeScript 4 空格缩进，Java 遵循 Google Java Format AOSP 风格
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

## 数据库与 Redis（WSL2）

PostgreSQL 18 与 Redis 7 跑在 WSL2 上（不用 Docker），Windows 侧经 localhost 直连转发：

- 数据库：`shop:shop_dev@localhost:5432/shop`
- Redis：`localhost:6379`

**后端突然连不上库（refused 或接口全超时），多半是 WSL 的 VM 被回收了**——没有 WSL 会话时几十秒就停，网络流量不算会话，配置项（vmIdleTimeout 等）实测无效；机制与全部实测结论见 `scripts/ensure-datastore.mjs` 头注释。应对只需三条命令：

```bash
pnpm dev:server   # 推荐：会话跟随后端进程，后端停即释放内存（vmmemWSL ~1.2GB）
pnpm db:up        # 从 IDE 跑后端 / mvn test 前拉起（含清孤儿会话）
pnpm db:down      # 用完还内存
```

换发行版用 `SHOP_WSL_DISTRO`；完全不挂会话用 `SHOP_WSL_KEEPALIVE=0`。
