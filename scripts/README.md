# scripts/ —— 仓库自动化脚本索引

**入口只有一个：`package.json` 的 `scripts`。** CI（`.github/workflows/ci.yml`）和
Lefthook（`lefthook.yml`）调的也是同一批 `pnpm <命令>`，不在别处按路径直调脚本——
本地跑绿了，CI 才是同一个绿。

每个脚本文件头的注释写的是**为什么这么做、踩过什么坑**，那是真相源；本文件只回答
「有哪些、干什么、前置条件是什么、有没有副作用」。改脚本前先读那个头注释。

命名约定：`<域>:<动作>`。`gen:*` 是生成器（写盘），`*:drift` 是漂移门禁（只读、不一致即红）。

---

## 门禁（会非零退出，进了 pre-push 与 CI）

| 命令                  | 作用                                                           | 前置           | 副作用 |
| --------------------- | -------------------------------------------------------------- | -------------- | ------ |
| `pnpm i18n:drift`     | 全语言资源重生成后比对，含「未使用 key」判据                   | 无             | 无     |
| `pnpm errors:drift`   | 错误码注册表 → Java/TS 两份词表比对（按语义比，容忍 spotless） | 无             | 无     |
| `pnpm sdk:drift`      | SDK 生成物 vs 已提交契约；后端在跑时再比契约 vs 运行中后端     | 无（后端可选） | 无     |
| `pnpm contract:audit` | 全字段为 null 的 roundtrip 校验，抓「契约可空但 SDK 强制」     | 需先 `sdk:gen` | 无     |

`sdk:drift` 离线部分生成到临时目录再 diff，**绝不写 `packages/api/src/sdk`**——pre-push
是并行的，落笔那一下会撞上正在读这些文件的 tsc/lint/vitest。

## 生成器（会写盘）

| 命令              | 写哪里                                                   | 前置                                  |
| ----------------- | -------------------------------------------------------- | ------------------------------------- |
| `pnpm i18n:gen`   | 各 root 的 `messages.gen.ts`                             | 无                                    |
| `pnpm errors:gen` | `ErrorCodes.java` + `packages/common/.../error-codes.ts` | 无                                    |
| `pnpm sdk:gen`    | `openapi/api-docs.json` + `packages/api/src/sdk/`        | **后端必须在跑**（`pnpm dev:server`） |

校验失败时一律**一个字节都不写**：半截生成物比没有生成物更糟。

## 本地环境与运维（这台 Windows 机器专属，别人 clone 不跟着走）

| 命令                                                  | 作用                                              | 副作用                                        |
| ----------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| `pnpm db:up` / `db:down`                              | 拉起 / 停掉数据面与后台隧道守护                   | 起后台进程；`db:down` 立刻还内存              |
| `pnpm dev:server`                                     | 后端 + 前台持有数据面会话（`--hold`）             | 后端一停数据面即释放                          |
| `pnpm guard:install` / `uninstall` / `status` / `run` | Windows 计划任务 `shop-tunnel-guard` 的注册与查看 | 改系统计划任务                                |
| `pnpm obs:dev` / `obs:up` / `obs:down` / `obs:status` | 本机 Prometheus + Alertmanager + Grafana          | 落 `~/.shop-obs`，首次下载二进制并校验 sha256 |
| `pnpm health:scan`                                    | 运营数据健康扫描，只读 SQL，输出可定位对象 ID     | 无（需 `pnpm db:up`）                         |
| `pnpm seed:demo`                                      | 灌演示数据（幂等、只增不改不删人工数据）          | 写本地 `shop` 库；`-- --dry-run` 只打印 SQL   |

数据面默认在**云上**（本地端口 15432/6379），口令与偏好读 `apps/server/.env`。
命令行显式导出的环境变量永远压得过它。`SHOP_DATASTORE=wsl` 是本机退路。

## 性能检查与诊断

| 命令                     | 量什么                                       | 备注                          |
| ------------------------ | -------------------------------------------- | ----------------------------- |
| `pnpm perf`              | Lighthouse，三端生产构建 + 各页 N 轮取中位数 | 分数低也退 0；假数才退非 0    |
| `pnpm perf:bundle`       | 构建三端 + Size Limit 检查七项 JS/CSS 预算   | 超预算或必需产物缺失即失败    |
| `pnpm perf:bundle:check` | 只检查已有 dist（Size Limit 原生配置）       | 不保证产物是最新代码          |
| `pnpm perf:attrib [app]` | Visualizer treemap / network 报告            | 生产构建，不进 dist           |
| `pnpm perf:cls`          | CLS 归因：位移时刻 / 被推走的节点 / 因果     | 纯诊断，参数口径要对齐 `perf` |

## 内部模块（别直接跑，被上面那些引用）

- `dotenv.mjs` —— `apps/server/.env` 的唯一读取处（只补未设置的键）。
- `with-datastore.mjs` —— `test:server` 的数据面探针，只探不跑、不自动拉起。
- `tunnel-supervisor.mjs` + `tunnel-supervisor.test.mjs` —— 隧道生命周期，纯逻辑可测。
- `tunnel-guard.cmd` —— 计划任务的启动器（运行时解析 node 路径）。**纯 ASCII、CRLF、
  注释里不许出现 `< > & | ( )`**，改之前读文件头。
- `ensure-datastore.mjs` —— 上述 `db:*` / `dev:server` 的实现本体。
- `seed-buyer-demo.sql` —— 手工执行：`psql -X -v ON_ERROR_STOP=1 -d shop -f scripts/seed-buyer-demo.sql`，未接 pnpm。
- `vite.config.ts` —— `scripts/*.test.mjs` 的 vitest project 配置。

## 加新脚本时

1. 逻辑写 `scripts/*.mjs`，`package.json` 里只放一行壳——别把 shell 塞进 `package.json`。
2. 生成器带 `--check`，并接进 `lefthook.yml` 的 pre-push 与 CI 的对应 step。
3. 头注释写「为什么」和踩过的坑，不写「它干什么」（那是本文件和代码的事）。
4. 能测就测：`scripts/*.test.mjs` 会被 `vp test` 的 `scripts` project 收走。
