# Shop — 多店铺电商平台

这份只放**每次写代码都要守的结论 + 去哪查**。解释、论证、运维叙事都在 `docs/`（按需读，不进默认上下文）。

## 基本规则

- 无需向后兼容，无需数据迁移
- 将你更改的内容替换为最简单的可工作代码，并在同一更改中更新所有调用者
- 以你需要我做什么开头,当一个长任务完成后，或者你卡住了需要我做些什么时，在回复的最顶部列出你需要我做的事情。每项一条，用编号。详细说明我应该做什么、在哪里做，以及完成后发回给你什么，例如“登录 Stripe，导出 9 月退款 CSV 文件，放进 inbox/”。最堵住你的那项放第一位。如果你什么都不需要我做，就直接说出来

## 技术栈

- 前端：TanStack Start (React 19) · TypeScript 7 · **Vite+ 1.0**（Vite8+Rolldown+Vitest5+Oxlint/Oxfmt/tsgolint 一个工具链）· Tailwind v4 · TanStack Query/Router
- 后端：Spring Boot 4.1 · Spring Modulith 2.1 · REST/OpenAPI · MyBatis-Plus 3.5 · PostgreSQL 18 · Redis 7
- 工具：Maven · pnpm 12 · Lefthook（git hooks 唯一持有者）· Spotless；前端 lint/fmt/typecheck/test 全走 `vp`

## 项目结构（pnpm workspace + catalog；除 workspace 外不上 turbo/nx）

- `apps/{web,seller,admin}`：买家 SSR / 卖家 SPA / 平台 SPA；`apps/server`：Spring 模块化单体（不参与 pnpm workspace）
- `packages/{api,common,i18n,monitoring,client,app-kit,ui-web,config,test-utils}`：`@shop/api` 除 `src/index.ts` 全是生成物，手写共享逻辑按下面「共享逻辑」那条选包
- 前端工具链配置只住根 `vite.config.ts`（`lint`/`fmt`/`run`/`test` 块）；各包的测试配置住各自的 `vite.config.ts`（根 `test` 块只列 projects，选项不继承下去）；另 `e2e/` `openapi/` `scripts/` `docs/`

## 常用命令

```bash
pnpm dev                       # 前后端一起；dev:web/seller/admin/server = 3000/5000/4000/8080
pnpm install                   # 本地装依赖（CI 用 vp install --frozen-lockfile，同一 lockfile）
vp check                       # 前端一把过：fmt+oxlint+tsgolint，~5s；改完先跑它
pnpm exec vp run verify        # check+typecheck+test 分段缓存；pre-push 门禁同一条命令
pnpm test                      # 全量 ~50s；开发期别默认它——时长被 import 绑死（见 frontend.md）
pnpm test:project <p> [路径]   # 只跑一个 project，开发期首选
pnpm test:related <文件>       # 只跑「谁引了它」，~20s；别名解析得动
pnpm test:watch                # 常驻只热跑改动，避开每轮重新 import
pnpm test:changed              # 未提交改动的影响；工作区干净时空跑 exit 0，别当通过
pnpm lint | format | typecheck # vp lint+mvn compile / vp fmt+spotless / 各包 tsc（TS7 ~4s）
pnpm test:server               # 后端单测（内置数据面探针，库没起就跳过并给修法）
pnpm fallow                    # 死代码+架构边界；fallow:audit 只审当前改动
pnpm build                     # 买家端（Rolldown）+ mvn compile；build:seller/admin 另两端
pnpm sdk:gen | errors:gen      # 需后端在跑：重生成 SDK / 错误码；对应 :drift 查漂移
```

> 更多低频命令（`perf*` / `obs:*` / `guard:*` / `seed:demo` / `health:scan` / `i18n:gen`）见 `package.json` 的 scripts。

## 规范在哪（动对应代码前先读）

| 你要动的东西                                                                                                                                                                    | 必读                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 后端：架构 / 命名 / 模块组织 / 测试                                                                                                                                             | `apps/server/AGENTS.md`（该目录自动加载）                                                                                     |
| 前端：目录 / 状态 / 取数 / 测试                                                                                                                                                 | [frontend.md](docs/conventions/frontend.md)（改取数前读其论证 [query-convergence.md](docs/conventions/query-convergence.md)） |
| i18n                                                                                                                                                                            | [i18n.md](docs/conventions/i18n.md)                                                                                           |
| 跨端契约：真相源 + codegen/drift，加/改一个契约码走哪几步（错误码 / 权限码 / locale / 路由 / SDK / 契约形状都套这个模板）                                                       | [contracts.md](docs/conventions/contracts.md)                                                                                 |
| 错误码                                                                                                                                                                          | [error-codes.md](docs/error-codes.md)                                                                                         |
| UI / 视觉 / 加组件                                                                                                                                                              | [DESIGN.md](packages/ui-web/DESIGN.md)                                                                                        |
| 架构总览 / 依赖图 / ID 与金额策略                                                                                                                                               | [architecture.md](docs/architecture.md)                                                                                       |
| 技术决策：某类通用问题有几条路、我们走了哪条（并发控制…）                                                                                                                       | [docs/adr/](docs/adr/)                                                                                                        |
| 业务规则（订单/券/物流/支付/账号…）                                                                                                                                             | [docs/business-rules/](docs/business-rules/)（改代码里的规则同步改条目）                                                      |
| vp 口径 / 数据面（PG·Redis·隧道）· 门禁（错误码 / 安全 / 体积 / 文档链接 / monorepo 一致性 / **契约形状** / **NullAway 后端静态分析** / **squawk 迁移 lint** / **axe 无障碍**） | [tooling.md](docs/conventions/tooling.md)                                                                                     |
| 监控 / 可观测性                                                                                                                                                                 | [frontend-monitoring.md](docs/conventions/frontend-monitoring.md) · [observability.md](docs/conventions/observability.md)     |
| 部署 / 发布 / 回滚（主机初始化、镜像、nginx、证书）                                                                                                                             | [deploy-runbook.md](docs/release/deploy-runbook.md)                                                                           |
| 进行中                                                                                                                                                                          | [TODO.md](TODO.md)                                                                                                            |

## 硬规则（一句一条；细则与门禁见上表对应文件）

- **Money**：全链路只有一个形状 `Money { amount(分), currency }`，DB 存 `(amount,currency)` 列对 + `CHECK`，不裸传 int64；前端展示只走 `formatMoney` / 共享 `Price`。门禁 `MoneyTypeRulesTest`
- **后端边界**：模块间只走对方 `index.ts`（api 包同步调用）或 events，不 import 对方 service/repo，不跨 schema JOIN
- **前端取数**：TanStack Query 是唯一服务端状态通道，不裸 fetch；key 工厂集中域内 `queries.ts`
- **前端写操作**：`useMutation` + `meta`（success/error/silentError/invalidates），反馈与失效交全局 MutationCache，不包 hook 工厂
- **前端测试**：`describe/it/expect/vi` 只从 **`vite-plus/test`** 导入（非裸 `vitest`，oxlint 拦）；MSW 只 mock 网络层；组件测试走各 app 的 `renderWithProviders`
- **共享逻辑**：手写共享逻辑按职责进包——契约词表与字段口径在 `packages/common`（`/contract`、`/domain`，纯常量与纯函数，不碰 `ky`/`react`），SDK 传输装配与登录态在 `@shop/client`，locale 与消息在 `@shop/i18n`，监控出口在 `@shop/monitoring`；横切单一出口另立包，不塞 common；不在 `@shop/api` 加手写文件；一个概念前端只一个出口
- **Tailwind 跨包**：给 ui-web / app-kit 加带类名组件时，确认三端 `styles.css` 的 `@source` 已覆盖（漏了静默掉样式，不报错）
- **密钥**：真实密钥只进 `apps/server/.env`（gitignored）或部署平台环境变量，不落代码 / yml / 仓库；连示例字面量也别写（会被扫描器判成泄漏，也容易被误抄进真实环境）。门禁：gitleaks（pre-commit 扫暂存 + CI 扫全历史），放行规则见 [tooling.md](docs/conventions/tooling.md)
- **提交**：Conventional Commits `<type>(<scope>): <subject>`；TS 4 空格（`vp fmt`），Java AOSP（`spotless`）

> 两条最容易被 AI 做错的操作约束：**`vp check --fix` 会把官方标为 dangerous 的 fix 一起应用、可能改坏类型（实测随包 oxlint 1.85.0 在纯 `--fix` 下就应用了 dangerous 的 `prefer-set-has`，违反 "--fix 只 safe" 的文档契约；该规则已顶层关闭，但 `--fix` 仍别盲信，跑完必过 `pnpm typecheck`**）；**数据面默认在云（本地端口 15432/6379），跑后端测试前先 `pnpm db:up`**。展开见 [tooling.md](docs/conventions/tooling.md)。
