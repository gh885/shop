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
scripts/                  ← node 脚本：数据面拉起与探针、造数、契约 / i18n / 错误码门禁（`error-codes-codegen.mjs`）、健康扫描
e2e/                      ← Playwright 用例与 fixtures（运行参数唯一出口 e2e/fixtures/env.ts）
openapi/                  ← 对外错误契约的登记处：api-docs.json（后端 /v3/api-docs 的导出）+ error-codes.mjs（手写的码表注册表，`pnpm gen:errors` 的输入）；packages/api 除 src/index.ts 外全是生成物
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
pnpm obs:up               # 本机可观测性栈（Prometheus+Alertmanager+Grafana，WSL systemd 托管）：装二进制+起+探测；obs:status 看状态，obs:down 停（不动数据面）
pnpm guard:status         # 隧道守护的登录自启计划任务是否注册/在跑（装了 guard:install 后数据面日常零操作）
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

**定义原则（2026-09-30 改版）：用户看到的句子由前端 catalog 或状态码通道给；`detail` 只在中文界面当文案，其它语种它是日志字段。** code 的准入条件是「前端要按它分支」或「兜底上报的真实频次证明它值得单独翻译」，**不是**「后端有一句话」——普查否掉了旧那句「这句话用户可见就要有 code」：全仓 267 个不带 code 的报错出口按旧判据补齐 = 204 个新码，而其中绝大多数前端从不按句子分叉。逐条码的唯一真相源是注册表 `openapi/error-codes.mjs`（一张卡 = `group` / `code` / `status` / `trigger` / `behavior` / 可选 `notes`），`ErrorCodes.java` 与 `packages/common/src/contract/error-codes.ts` 是 `pnpm gen:errors` 的产物——**手改产物无效**，下一个人重生成时那一次静默消失；`pnpm errors:drift`（已进 pre-push 与 CI）核生成物与注册表一致。判据、普查口径、五支兜底链、升级闭环写在 `docs/error-codes.md`（它不再抄那份表）。新建 code 先在注册表写一张卡——`behavior` 必须以「按码分支：」或「不按码分支：」开头，这一句是**可核对的声明**，门禁拿它与生产前端真实的 `ErrorCodes.X` 读点两向核——然后 `pnpm gen:errors`，再在 `packages/app-kit/src/locales/{zh-CN,en-US}/error.json` 各补一句——`notify.ts` 按 code 取 catalog，取不到才轮到 `detail`（中文界面）或按状态码的通用句（其它语种）。

> 判据改版已落地（[docs/conventions/i18n.md](docs/conventions/i18n.md) §7.3）：文案归前端 catalog，`detail` 降级为中文界面那一格的兜底 + 日志。句子装不下关键值时走**字段级参数通道**（ProblemDetail 扩展属性 `errors` = `[{ field, message, value? }]`，前端对边是 `packages/common` 的 `ApiFieldError`）——值作为数据出一次，不写进中文句子让前端正则捞；`FORBIDDEN_WORD_HIT` 已按这条退出；**detail 优先的例外清单已于 2026-10 清空**（`ADDRESS_LIMIT_EXCEEDED` / `MERCHANT_ADDRESS_LIMIT_EXCEEDED` 改走 `params` 通道，上限数字作为数据出、前端 catalog 用 `{limit}` 槽位接，后端改数字前端零改动）。没有对应字段可定位的码用 `params`（`ApiError.params`，标量白名单），有字段的用 `errors`；槽位映射写在 `error-keys.ts` 的 `CODE_SLOTS`，`error-keys.test.ts` 双向核，且**槽位没填上不许印裸 `{limit}`**（退回按 locale 的兜底并上报）。code 的生命周期与兼容性规则、HTTP 状态码选择依据、`detail` 的对外口径见 `docs/error-codes.md` 头部。还欠的两件（`error_fallback` 上报的接收端与「按频次升级」的例行、422 校验族参数化）记在 `docs/error-codes.md` 头部与 `TODO.md`。

- Java 侧抛出点不写字面量，一律 `com.shop.platform.common.ErrorCodes.X`（`ErrorCodeVocabularyTest` 核对**四边**：Java 常量集合 ⇄ 该表 Code 列 ⇄ TS `ErrorCodes` 键集合 ⇄ 两份 `error.json` 的 `error.<CODE>`（每码每语言恰有一条、非空），且每处抛码站点由出口推出的状态码 ⇄ 该表 HTTP 列——改任何一边忘了另一边就红；TS 侧另有 `error-keys.ts` 的 `satisfies` 在编译期拦同一件事）
- TS 侧同步到 `packages/common/src/contract/error-codes.ts`，code 用 `SCREAMING_SNAKE_CASE`
- 前端能用 status 区分的（401/403/404）不加 code——**前提是那句用户可见文案由状态码那条通道自己出**（404 页、错误边界、未登录跳转）；被 Zod 拦住的校验错误由 422 的 `errors` 列表承载，同理

## 数据库与 Redis（默认在云主机）

**默认走云**（`SHOP_DATASTORE=remote`）：PG 18 / Redis 7 在云主机的容器里（清单 `deploy/dataplane.compose.yml`），本机持有的是一条 ssh 端口隧道——本地 `15432/6379` → 云 `5433/6379`（主机别名 `SHOP_SSH_HOST`，默认 `aliyun`）。`dev:server` / `db:up` / `db:down` / `test:server` 四条命令用法不变，换数据面不改肌肉记忆。本地端口沿用 15432/6379，所以 JDBC URL、`application-test.yml`、seed、e2e 一处都不用改。

- **本机 WSL 里的 PG / Redis 已 `systemctl disable --now`**（2026-10 起）。这是有意的：它们原先 `enabled`，WSL 一启动就抢 15432/6379，于是「隧道没起」时会静默落到本地库——backend 跑起来、数据也是真的，看着一切正常，实则写进了另一台库。现在这两个端口没有第二个属主，隧道不在就是 connection refused，**错库不再可能静默发生**。
- **端口是 15432 不是 5432**（GameViewerServer 绑死了 Windows 的 `0.0.0.0:5432`）。CI 的 PG service 仍在 5432，由 workflow 里 `SHOP_DB_PORT=5432` 覆盖。全链口径收在 `SHOP_DB_*` / `SHOP_REDIS_*` 变量族（application{,-test}.yml / scripts / e2e，含 host / user / password）。
- **认端口属主那道闸还在**：remote 下起隧道前会查本地这两个端口是谁在听，认不出属主就拒绕起隧道，绝不静默接到别的库上。
- **隧道是自愈的**：`pnpm db:up` 拉起的不是一个裸 ssh，而是一个后台守护进程（`--tunnel-guard`）——ssh 自己不会重连，断线后没人补就是「断了要手动重跑 db:up」。守护盯着端口、断了退避补一条，所以合盖 / 切 Wi-Fi / 云主机重启都能自己恢复（实测断线后 ~3s 回来）。日志在 `~/.shop-datastore/tunnel-guard.log`。
- **守护已注册为 Windows 计划任务「shop-tunnel-guard」**（`pnpm guard:install`）：登录时由系统以你的身份拉起，父进程是 Task Scheduler 的 svchost，**与任何终端无关**——关掉跑过 `db:up` 的窗口不影响它。任务用 XML 注册是为了改掉几个会坑死常驻进程的默认行为（默认拔电不启动、默认 72h 强杀、默认仅在空闲时运行）。装了它之后日常不需要跑任何数据面命令；`pnpm db:down` 仍能临时断一次，但下次登录守护会自己回来（要彻底停用跑 `pnpm guard:uninstall`）。
- **node 路径不写死**：任务调的是 `scripts/tunnel-guard.cmd`，它在运行时按 mise shim → PATH → mise installs 解析 node，所以 mise 升 node 大版本不需要重装任务。那个 .cmd 有两条硬约束：必须**纯 ASCII**、且 `rem` 注释里不能出现 `<` `>` `&` `|` `(` `)`（cmd 会当重定向/命令分隔符，然后**静默**退出，不报错不写日志）。它还必须以 CRLF 存盘（已在 `.gitattributes` 里给 `*.cmd` 声明 `eol=crlf`），因为 cmd 对 LF-only 的批处理解析不可靠。这几条都踩过，改它之前先读文件头注释。
- **云机有公网 IP，所以库与 Redis 只 bind `127.0.0.1`，安全组只留 22/80/443**。
- **跑后端测试前先让数据面在位**：接口契约测试（`WebControllerTestSupport` 子类）起真实上下文连专用库 `shop_test`，库没起时整类红，Spring 的 failure threshold 还会带走后面几百个用例——看着像代码坏了，其实只是连不上。`pnpm test:server` 已内置探针（毫秒级，库不在就跳过并给修法）；直跑 `mvn test` 请自己先 `pnpm db:up`。
- **`wsl` 只作为退路保留**，要显式 `SHOP_DATASTORE=wsl` 才走。它那套坑（VM 空闲几十秒被回收、网络流量不算会话、~1.2GB vmmemWSL 要挂会话按着）都写在 `scripts/ensure-datastore.mjs` 头注释；真要用得先在 WSL 里 `systemctl enable --now postgresql redis-server` 把端口还回去。
- `apps/server/.env`（gitignored）是 dev 数据面配置的唯一本地来源：口令 `SHOP_DB_PASSWORD` / `SHOP_REDIS_PASSWORD` 与偏好 `SHOP_DATASTORE` 都写这里，接法在 `scripts/dotenv.mjs`（Spring dev 段、seed、e2e、`db:up` 读同一份）。命令行显式导出永远压得过它，删掉那行则回到默认 `remote`，所以 `SHOP_DATASTORE=wsl pnpm db:up` 随时能切到本地退路一次。
