# Shop — 多店铺电商平台

## 技术栈

- 前端：TanStack Start (React 19), TypeScript 7, **Vite+ 1.0**（Vite 8 + Rolldown + Vitest 5 + Oxlint/Oxfmt/tsgolint 一个工具链）, Tailwind v4, TanStack Query/Router
- 后端：Spring Boot 4.1, Spring Modulith 2.1, REST (OpenAPI), MyBatis-Plus 3.5, PostgreSQL 18, Redis 7
- 工具：Maven, pnpm 12, Lefthook（git hooks 的唯一持有者）, Spotless (Google Java Format)；前端 lint/fmt/typecheck/test 全走 `vp`

## 项目结构

```
shop/                     ← monorepo（pnpm workspace + catalog；除 workspace 外不上 turbo/nx）
vite.config.ts            ← 前端工具链唯一配置入口（lint/fmt/check/run 块）；packages/config 那两份是被它消费的对象
vitest.config.ts          ← 测试的 projects 清单（逐个点名各包的 vitest.config.ts）
apps/server/              ← Spring Boot 模块化单体（不参与 pnpm workspace）
apps/{web,seller,admin}/  ← 买家端 SSR / 卖家工作台 SPA / 平台管理端 SPA
packages/                 ← 共享包（api / common / app-kit / ui-web / config / test-utils）
scripts/                  ← node 脚本：数据面拉起与探针、造数、契约与 i18n 门禁、健康扫描
e2e/                      ← Playwright 用例与 fixtures（运行参数唯一出口 e2e/fixtures/env.ts）
openapi/                  ← api-docs.json（后端 /v3/api-docs 导出）；packages/api 除 src/index.ts 外全是生成物
docs/                     ← 架构 / 约定 / 决策 / 调研（索引见 README「文档地图」）
```

## 常用命令

```bash
pnpm dev | dev:server | dev:web | dev:seller | dev:admin   # 前后端一起 / 8080 / 3000 / 5000 / 4000
pnpm install              # 本地装依赖（CI 用 vp install --frozen-lockfile，同一份 lockfile）

# 检查
vp check                  # 前端一把过：fmt + oxlint + tsgolint 类型，~5s；改完前端代码先跑它
pnpm exec vp run verify   # check + typecheck + test 串行且分段缓存：零改动重跑 0.4s，冷跑 ~54s
pnpm test                 # 前端全量（~40s / 117 文件 / 986 用例）；push 前跑它或 verify
pnpm test:project <p> [路径]  # 只跑某个 project（web/seller/admin/@shop/common/…），开发期首选
pnpm exec vp test related <文件>  # 反查「谁引了它」，连 `#/` 别名一起解析得动
pnpm lint                 # vp lint（类型感知）+ mvn compile；pnpm format = vp fmt + spotless:apply
pnpm typecheck            # 递归各包 tsc --noEmit（TS 7 原生 ~4s）
pnpm test:server          # 后端单测（内置数据面探针，库没起就跳过并给修法）
pnpm fallow               # 死代码 + 架构边界（域间只走对方 index.ts）；pnpm fallow:audit 只审当前改动（恒退 0，去掉 --brief 才是门禁）
pnpm seed:demo            # 灌演示数据（scripts/seed-demo.mjs，只增不改人工数据、幂等；--dry-run 只打印 SQL）
pnpm gen:sdk              # 需后端在跑：导出契约 + 重新生成 packages/api/src/sdk + contract:audit
pnpm build                # 买家端（vp build / Rolldown）+ mvn compile；另两端 build:seller / build:admin
pnpm perf                 # 实验室首屏测量（三端生产构建 + preview，Lighthouse）；需后端在跑，只记录不阻断
pnpm perf:bundle          # 三端 dist 的 gzip 字节，逐 chunk 与基线比差值——零噪声、~1 分钟，同样不阻断
pnpm perf:attrib          # 把首屏字节归属到源文件（`--why X` 答「是谁把 X 带进首屏」）；口径同 perf:bundle，见 perf/README.md
node scripts/perf-cls.mjs <url> [--preset desktop]  # CLS 归因：带时间戳的 layout-shift trace（DOM 变化 / CSSOM / 逐帧矩形三层 + `--block` 因果 A/B），在生产构建的 preview 上跑
cd apps/server && mvn spring-boot:run   # 单独起后端（mvn compile / spotless:apply 同理）
```

## 规范在哪（动对应代码前先读）

| 你要动的东西                                           | 必读                                                                                                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 后端：架构规则、模块组织、命名、测试                   | `apps/server/AGENTS.md`（本目录自动加载）                                                                                                                                    |
| 前端（`apps/*`、`packages/*`）：目录、状态、取数、测试 | [docs/conventions/frontend.md](docs/conventions/frontend.md)；改取数条款前先读其论证 [query-convergence.md](docs/conventions/query-convergence.md)                           |
| 国际化 i18n                                            | [docs/conventions/i18n.md](docs/conventions/i18n.md)                                                                                                                         |
| 前端监控 / 可观测性                                    | [frontend-monitoring.md](docs/conventions/frontend-monitoring.md) / [observability.md](docs/conventions/observability.md)；改首屏测量口径看 [perf/README.md](perf/README.md) |
| UI / 视觉 / 加组件                                     | [packages/ui-web/DESIGN.md](packages/ui-web/DESIGN.md)                                                                                                                       |
| 架构总览、模块依赖图、关键链路、全库 ID 与金额策略     | [docs/architecture.md](docs/architecture.md)                                                                                                                                 |
| 业务规则（订单/券/物流/售后/支付/账号…的生效规则清单） | [docs/business-rules/](docs/business-rules/)（逐条带编号；改代码里的规则要同步改对应条目）                                                                                   |
| 当前进行中的事                                         | [TODO.md](TODO.md)                                                                                                                                                           |

## 高频硬规则（细则与论证见上表对应文件）

- **Money**：金额全链路只有一个形状 `Money { amount(分), currency }`——DB 存 `(amount, currency)` 列对 + `CHECK (currency='CNY')`，Java / OpenAPI 契约 / TS 同名同形，不裸传 int64。前端展示只走 `formatMoney` / 共享 `Price`，符号跟币种，不各处手写 `¥${fenToYuan(m.amount)}`。编译期门禁 `MoneyTypeRulesTest`
- **后端**：模块间只走 api 包同步调用或 events 事件，不 import 对方 service/repo；不许跨 schema JOIN；跨 schema 裸 SQL 只允许 `infra.db` 与各模块 api 包
- **前端取数**：TanStack Query 是唯一服务端状态通道，不裸 fetch；key 工厂集中域内 `queries.ts`，不造第二棵 key 树；loader 预取用 `query({ ...options, staleTime: "static" })`
- **前端写操作**：库 `useMutation` + `meta`（success/error/silentError/invalidates）声明，反馈与失效由全局 MutationCache 执行，不包 hook 工厂，`invalidates` 传真实 query key
- **前端错误态**：`throwOnError` 全局默认 `throwWhenNoData`（失败抛给边界）；只有头上没有边界可接的查询才显式 `throwOnError: false` 就地渲染
- **前端测试**：MSW 只 mock 网络层（禁 `vi.mock` 业务模块）；组件测试走各 app 的 `renderWithProviders`（应用真实 QueryClient 默认值），不裸 `new QueryClient()`；`describe/it/expect/vi` 只从 **`vite-plus/test`** 导入（不是裸 `vitest`，oxlint 拦）
- **共享逻辑**：手写共享逻辑一律 `packages/common`，禁止在 `@shop/api` 内新增手写文件（那里全是生成物）；一个概念在前端只许有一个出口，由 `packages/common/src/shared-vocabulary.test.ts` 钉住
- **Tailwind 跨包**：给 ui-web / app-kit 加带类名的组件时，确认三端 `styles.css` 的 `@source` 已覆盖（漏了是静默掉样式，不报错）

### Vite+（`vp`）在本仓库的口径

文档在 `node_modules/vite-plus/docs`（线上 https://viteplus.dev/guide/ ）；行为不对时跑 `pnpm exec vp env doctor` 并带上输出求助。

- **一份入口**：lint / fmt / 类型检查 / 测试 / 任务只有 `vp`。全局 `vp` 不装（它会连 Node 和包管理器一起接管），一律 `pnpm exec vp`；`package.json` script 是 CI 与 hooks 的命令唯一出口，优先 `pnpm <script>`。
- **`vp <name>` 是内建、`vp run <name>` 才跑 script/task**，同名不同命（`vp dev` ≠ `vp run dev`）。
- **配置只住根 `vite.config.ts` 的 `lint`/`fmt` 块**：包级块对逐文件不生效，`vp lint`/`vp fmt` 也没有 `--config` 这条路，从子包目录跑 `vp check` 用的仍是根设置。忽略口径的唯一出口是根配置的 `lint.ignorePatterns` / `fmt.ignorePatterns`（原来仓库根那两份 ignore 文件已删——oxc 按配置文件所在目录解析 ignore，只有根配置能匹配全仓路径）。fallow 两边都不读，用它自己的 `.fallowrc.json`。
- **`defaultPackage: "./apps/web"`**：根目录裸 `vp build` 只构建买家端，另两端要显式 `-C`（`pnpm exec vp -C apps/seller build`）。
- **git hooks 归 Lefthook**（`lefthook.yml`），别跑 `vp config --hooks`。
- **`vp check --fix` 的自动修复不安全**（实测它删类型断言、把 `x[len-1]` 改成 NodeList 上没有的 `.at(-1)`）：逐目录跑，跑完必跟 `pnpm exec vp check` + `pnpm test`。论证、账目与测试提速的实测结论见 frontend.md「自动修复」「告警预算」「迭代性能」。
- 注：`vp` 会往 AGENTS.md 的 `<!--VITE PLUS START/END-->` 区间写它的通用说明并**整段覆盖**，所以本仓库的 Vite+ 约定一律写在这节，不要塞进那个区间。

## 开发规范

- 提交遵循 Conventional Commits：`<type>(<scope>): <subject>`（scope 可选）
- TypeScript 4 空格缩进（`vp fmt` 负责），Java 遵循 Google Java Format AOSP（`pnpm format` 两边一起管）

## 错误码规范

**定义原则：只有当 HTTP status 不足以让前端区分处理逻辑时，才定义 error code。** 唯一真相源是 `docs/error-codes.md`：新建 code 必须先在那里写清「前端行为」和「后端触发场景」。

> 这条判据正在改版（**未落地**）：[docs/conventions/i18n.md](docs/conventions/i18n.md) §7.3 把用户可见错误文案归到前端 catalog、`detail` 降级为日志字段，判据随之换成「这句话用户可见 → 就要有 code」。做完之前按上面那句办，之后以 `docs/error-codes.md` 为准；`detail` 兜底的两个退出条件记在 `TODO.md`。

- Java 侧抛出点不写字面量，一律 `com.shop.platform.common.ErrorCodes.X`（`ErrorCodeVocabularyTest` 核对：Java 常量集合 ⇄ 该表 Code 列 ⇄ TS `ErrorCodes` 键集合，且每处抛码站点由出口推出的状态码 ⇄ 该表 HTTP 列——改任何一边忘了另一边就红）
- TS 侧同步到 `packages/common/src/error-codes.ts`，code 用 `SCREAMING_SNAKE_CASE`
- 前端能用 status 区分的（401/403/404）不加 code；会被 Zod 拦住的校验错误也不加 code

## 数据库与 Redis（WSL2）

跑在 WSL2 上（不用 Docker，`.wslconfig` 已开 `networkingMode=mirrored`），Windows 侧经 localhost 直连：库 `shop:shop_dev@localhost:15432/shop`、Redis `localhost:6379`。

- **端口是 15432 不是 5432**（GameViewerServer 绑死了 Windows 的 `0.0.0.0:5432`，镜像网络共享栈下 PG 绑不上）。CI 的 PG service 仍在 5432，由 workflow 里 `SHOP_DB_PORT=5432` 覆盖。全链口径收在 `SHOP_DB_*` / `SHOP_REDIS_*` 变量族（application{,-test}.yml / scripts / e2e，含 host / user / password）。
- **后端突然连不上库（refused 或接口全超时），多半是 WSL 的 VM 被回收了**——没有会话时几十秒就停，网络流量不算会话，配置项实测无效（机制见 `scripts/ensure-datastore.mjs` 头注释）。应对只有三条命令：`pnpm dev:server`（推荐，会话跟随后端进程，停即释放 ~1.2GB）、`pnpm db:up`（从 IDE 跑后端 / `mvn test` 前拉起）、`pnpm db:down`（用完还内存）。换发行版 `SHOP_WSL_DISTRO`，完全不挂会话 `SHOP_WSL_KEEPALIVE=0`。
- **跑后端测试前先让数据面在位**：接口契约测试（`WebControllerTestSupport` 子类）起真实上下文连专用库 `shop_test`，库没起时整类红，Spring 的 failure threshold 还会带走后面几百个用例——看着像代码坏了，其实只是连不上。`pnpm test:server` 已内置探针（毫秒级，库不在就跳过并给修法）；直跑 `mvn test` 请自己先 `pnpm db:up`。
- **也可以换到云上**：`SHOP_DATASTORE=remote`（默认 `wsl`），`dev:server` / `db:up` / `db:down` / `test:server` 用法不变。remote 持有的是本地 15432/6379 → 云 5433/6379 的一条 ssh 隧道（云侧清单 `deploy/dataplane.compose.yml`，主机别名 `SHOP_SSH_HOST`），WSL 那套保活会话整体不需要了。本地端口沿用所以 JDBC URL、`application-test.yml`、seed、e2e 零改动；代价是和本机 WSL 抢同一对端口——认不出端口属主就拒绝起隧道，绝不静默连到本地库上假装一切正常。云机有公网 IP，所以库与 Redis 只 bind `127.0.0.1`，安全组只留 22/80/443。
- `apps/server/.env`（gitignored）是 dev 数据面配置的唯一本地来源：口令 `SHOP_DB_PASSWORD` / `SHOP_REDIS_PASSWORD` 与偏好 `SHOP_DATASTORE` 都写这里，接法在 `scripts/dotenv.mjs`（Spring dev 段、seed、e2e、`db:up` 读同一份）。命令行显式导出永远压得过它，所以 `SHOP_DATASTORE=wsl pnpm db:up` 随时能切回去一次。
