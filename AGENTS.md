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
pnpm dev                       # 前后端一起（买家端 3000 + 后端 8080）；另两端 pnpm --filter seller dev（admin 同理）
pnpm install                   # 本地装依赖（CI 用 vp install --frozen-lockfile，同一 lockfile）
vp check                       # 前端一把过：fmt+oxlint+tsgolint，~5s；改完先跑它
vp run verify                  # check+typecheck+test 分段缓存；pre-push 门禁同一条命令
pnpm test                      # 全量 ~50s；开发期别默认它——时长被 import 绑死（见 frontend.md）
pnpm test --project <p> [路径]   # 只跑一个 project，开发期首选
pnpm test:related <文件>       # 只跑「谁引了它」，~20s；别名解析得动
pnpm test:watch                # 常驻只热跑改动，避开每轮重新 import
pnpm test --changed              # 未提交改动的影响；工作区干净时空跑 exit 0，别当通过
pnpm lint | format | typecheck # vp lint+mvn compile / vp fmt+spotless / 各包 tsc（TS7 ~4s）
pnpm test:server               # 后端单测（内置数据面探针，库没起就跳过并给修法）
pnpm fallow                    # 死代码+架构边界；fallow:audit 只审当前改动
pnpm build                     # 买家端（Rolldown）+ mvn compile；另两端 pnpm --filter seller build（admin 同理）
pnpm sdk:gen | errors:gen      # 需后端在跑：重生成 SDK / 错误码；对应 :drift 查漂移
```

> 更多低频命令（`perf*` / `obs` / `guard` / `seed:demo` / `health:scan` / `i18n:gen`）见 `package.json` 的 scripts。

## 规范在哪

按任务分流看 [docs/README.md](docs/README.md)——**唯一索引**。新增文档前先问：能不能并进已有那份？

## 硬规则（一句一条；细则见 docs/README.md 指向的对应文件）

- **Money**：全链路只有一个形状 `Money { amount(分), currency }`，DB 存 `(amount,currency)` 列对 + `CHECK`，不裸传 int64；前端展示只走 `formatMoney` / 共享 `Price`。门禁 `MoneyTypeRulesTest`
- **后端边界**：模块间只走对方 `index.ts`（api 包同步调用）或 events，不 import 对方 service/repo，不跨 schema JOIN
- **前端取数**：TanStack Query 是唯一服务端状态通道，不裸 fetch；key 工厂集中域内 `queries.ts`
- **前端写操作**：`useMutation` + `meta`（success/error/silentError/invalidates），反馈与失效交全局 MutationCache，不包 hook 工厂
- **前端测试**：`describe/it/expect/vi` 只从 **`vite-plus/test`** 导入（非裸 `vitest`，oxlint 拦）；MSW 只 mock 网络层；组件测试走各 app 的 `renderWithProviders`
- **共享逻辑**：手写共享逻辑按职责进包——契约词表与字段口径在 `packages/common`（`/contract`、`/domain`，纯常量与纯函数，不碰 `ky`/`react`），SDK 传输装配与登录态在 `@shop/client`，locale 与消息在 `@shop/i18n`，监控出口在 `@shop/monitoring`；横切单一出口另立包，不塞 common；不在 `@shop/api` 加手写文件；一个概念前端只一个出口
- **Tailwind 跨包**：给 ui-web / app-kit 加带类名组件时，确认三端 `styles.css` 的 `@source` 已覆盖（漏了静默掉样式，不报错）
- **密钥**：真实密钥只进 `apps/server/.env`（gitignored）或部署平台环境变量，不落代码 / yml / 仓库；连示例字面量也别写（会被扫描器判成泄漏，也容易被误抄进真实环境）。门禁：gitleaks（pre-commit 扫暂存 + CI 扫全历史），放行规则见 [tooling.md](docs/conventions/tooling.md)
- **性能工作的验收口径**：`perf/`（实验室测量）与 `packages/monitoring`（RUM 采集）都以**本地 dev 能跑通、能看到数字**为目标，不是生产监控的交付。生产 RUM 链路是**刻意关闭的已知取舍**（`SHOP_RUM_ENABLED:false`，那台机器塞不下 broker），不是待办，别顺手补 broker / 告警 / SLO，也别在文档或 TODO 里把它写成缺口。要动部署先问主人。目录约定与用法见 [perf/README.md](perf/README.md)
- **提交**：Conventional Commits `<type>(<scope>): <subject>`；TS 4 空格（`vp fmt`），Java AOSP（`spotless`）

> 最容易被 AI 做错的操作约束：**`vp check --fix` 会把官方标为 dangerous 的 fix 一起应用、可能改坏类型（实测随包 oxlint 1.85.0 在纯 `--fix` 下就应用了 dangerous 的 `prefer-set-has`，违反 "--fix 只 safe" 的文档契约；该规则已顶层关闭，但 `--fix` 仍别盲信，跑完必过 `pnpm typecheck`**。展开见 [tooling.md](docs/conventions/tooling.md)。
