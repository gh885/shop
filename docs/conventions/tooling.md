# 工具链与数据面（仓库特定口径）

这份从 `AGENTS.md` 下沉：AGENTS.md 每次自动进 AI 上下文，只留骨架与指针；这里是按需读的细节。行为与本文件不符时，跑 `pnpm exec vp env doctor` 带上输出求助。

## Vite+（`vp`）在本仓库的口径

通用文档在 `node_modules/vite-plus/docs`（线上 https://viteplus.dev/guide/ ）。下面全是**本仓库特有**、通用文档没有的约定：

- **一份入口**：lint / fmt / 类型检查 / 测试 / 任务只有 `vp`。**全局 `vp` 可以装**（本机已装，跑 `vp upgrade` 升级）——`vp dev/build/test/check` 会自动委托到项目本地 `vite-plus` 的版本，不因全局版本而分叉，用 `vp toolchain` 可看当前选中的是哪套。唯一要钉死的是**别让 `vp env` 接管 Node 和包管理器**：本仓库 Node 归 mise、包管理归 pnpm 12，跑 `vp env off` 设成系统优先即可，否则 vp 的 shim 会和 mise/pnpm 抢 ownership。命令出口照旧：`package.json` script 里裸 `vp`（从 `node_modules/.bin` 解析），CI 与 hooks 走 `pnpm <script>` / `pnpm exec vp`。
- **`vp <name>` 是内建、`vp run <name>` 才跑 script/task**，同名不同命（`vp dev` ≠ `vp run dev`）。
- **配置只住根 `vite.config.ts` 的 `lint`/`fmt` 块**：包级块对逐文件不生效（Oxlint 在 Vite+ 模式下禁用嵌套配置）；从子包目录跑 `vp check` 用的仍是根设置（包级配置不能替换根的 `lint`/`fmt` 块）。`-c`/`--config` 这条路**是有的**（`vp lint -c <path>` / `vp fmt -c <path>`；注意两边的 `--help` 都没列它，实测 v1.0.0 才确认——`vp lint --help` 里的 `--print-config` 不是同一个东西），但它选的是 **Oxlint / Oxfmt 的原生配置文件**，不是带 `lint`/`fmt` 块的 `vite.config.ts`；迁移前 `lint:web` 里那条 `oxlint --config packages/config/oxlint.config.ts` 是原生 CLI 的形态，两者不是一回事。忽略口径的唯一出口是根配置的 `lint.ignorePatterns` / `fmt.ignorePatterns`（仓库根那两份 ignore 文件已删——oxc 按配置文件所在目录解析 ignore，只有根配置能匹配全仓路径）。fallow 两边都不读，用它自己的 `.fallowrc.json`。
- **`defaultPackage: "./apps/web"`**：根目录裸 `vp build` 只构建买家端，另两端要显式 `-C`（`pnpm exec vp -C apps/seller build`）。
- **git hooks 归 Lefthook**（`lefthook.yml`），别跑 `vp config --hooks`。
- **`vp check --fix` 别指望它只给 safe fix**：oxlint 把 fix 分 safe/dangerous 两档，文档契约是 `--fix` 只应用 safe、dangerous 要 `--fix-dangerously`；但实测随包的 oxlint 1.85.0 在**纯 `--fix`** 下就把官方标为 dangerous 的 `unicorn/prefer-set-has` 应用了（把 `readonly string[]` 数组改成 `new Set(...)` 却不改注解 → tsc `TS2740/TS2339`）。这是 Vite+/oxlint 的 `--fix` 语义问题，不是本仓库规则配错（`oxlint.config.ts` 从没要求跑 dangerous）。已把 `prefer-set-has` 顶层关闭消掉这个元凶；其余 dangerous fix 仍可能泄漏，所以 `--fix` 跑完必跟 `pnpm exec vp check` + `pnpm typecheck` + `pnpm test`。完整机制与 A/B 实测见 [frontend.md](frontend.md)「自动修复」。
- **`vp` 会往 `AGENTS.md` 的 `<!--VITE PLUS START/END-->` 区间写它的通用说明并整段覆盖**，所以本仓库的 Vite+ 约定一律写在正文，不要塞进那个区间。

## 开发日志转发

买家端保留 Vite+ 的浏览器 → 终端日志转发，关闭 `@tanstack/devtools-vite` 的 `consolePiping`（`apps/web/vite.config.ts`）。Devtools 的其他能力不变。两套管道同时开启时，Vite+ 打印的客户端日志会被 Devtools 当成服务端日志送回浏览器，再被 Vite+ 收回，反复叠加 `[Server]`，造成日志持续膨胀。不要靠降低日志级别掩盖这个循环。

验证：启动买家端，在后端暂未启动时打开首页触发网络错误；错误应正常输出，但不应不断嵌套 `[Server]`。后端就绪后刷新首页并搜索商品，确认页面恢复。

## 数据库与 Redis（默认在云主机）

**默认走云**（`SHOP_DATASTORE=remote`）：PG 18 / Redis 7 在云主机的容器里（清单 `deploy/dataplane.compose.yml`），本机持有的是一条 ssh 端口隧道——本地 `15432/6379` → 云 `5433/6379`（主机别名 `SHOP_SSH_HOST`，默认 `aliyun`）。`dev:server` / `db:up` / `db:down` / `test:server` 四条命令用法不变，换数据面不改肌肉记忆。本地端口沿用 15432/6379，所以 JDBC URL、`application-test.yml`、seed、e2e 一处都不用改。

- **本机 WSL 里的 PG / Redis 已 `systemctl disable --now`**（2026-10 起）。这是有意的：它们原先 `enabled`，WSL 一启动就抢 15432/6379，于是「隧道没起」时会静默落到本地库——backend 跑起来、数据也是真的，看着一切正常，实则写进了另一台库。现在这两个端口没有第二个属主，隧道不在就是 connection refused，**错库不再可能静默发生**。
- **端口是 15432 不是 5432**（GameViewerServer 绑死了 Windows 的 `0.0.0.0:5432`）。CI 的 PG service 仍在 5432，由 workflow 里 `SHOP_DB_PORT=5432` 覆盖。全链口径收在 `SHOP_DB_*` / `SHOP_REDIS_*` 变量族（application{,-test}.yml / scripts / e2e，含 host / user / password）。
- **认端口属主那道闸还在**：remote 下起隧道前会查本地这两个端口是谁在听，认不出属主就拒绕起隧道，绝不静默接到别的库上。
- **隧道是自愈的**：`pnpm db:up` 拉起的不是一个裸 ssh，而是一个后台守护进程（`--tunnel-guard`）——ssh 自己不会重连，断线后没人补就是「断了要手动重跑 db:up」。守护盯着端口、断了退避补一条，所以合盖 / 切 Wi-Fi / 云主机重启都能自己恢复（实测断线后 ~3s 回来）。日志在 `~/.shop-datastore/tunnel-guard.log`。
- **守护已注册为 Windows 计划任务「shop-tunnel-guard」**（`pnpm guard:install`）：登录时由系统以你的身份拉起，父进程是 Task Scheduler 的 svchost，**与任何终端无关**——关掉跑过 `db:up` 的窗口不影响它。任务用 XML 注册是为了改掉几个会坑死常驻进程的默认行为（默认拔电不启动、默认 72h 强杀、默认仅在空闲时运行）。装了它之后日常不需要跑任何数据面命令；`pnpm db:down` 仍能临时断一次，但下次登录守护会自己回来（要彻底停用跑 `pnpm guard:uninstall`）。
- **node 路径不写死**：任务调的是 `scripts/tunnel-guard.cmd`，它在运行时按 mise shim → PATH → mise installs 解析 node，所以 mise 升 node 大版本不需要重装任务。那个 .cmd 有两条硬约束：必须**纯 ASCII**、且 `rem` 注释里不能出现 `<` `>` `&` `|` `(` `)`（cmd 会当重定向/命令分隔符，然后**静默**退出，不报错不写日志）。它还必须以 CRLF 存盘（已在 `.gitattributes` 里给 `*.cmd` 声明 `eol=crlf`），因为 cmd 对 LF-only 的批处理解析不可靠。这几条都踩过，**改它之前先读文件头注释**（那里是真相源）。
- **云机有公网 IP，所以库与 Redis 只 bind `127.0.0.1`，安全组只留 22/80/443**。
- **跑后端测试前先让数据面在位**：接口契约测试（`WebControllerTestSupport` 子类）起真实上下文连专用库 `shop_test`，库没起时整类红，Spring 的 failure threshold 还会带走后面几百个用例——看着像代码坏了，其实只是连不上。`pnpm test:server` 已内置探针（毫秒级，库不在就跳过并给修法）；直跑 `mvn test` 请自己先 `pnpm db:up`。
- **`wsl` 只作为退路保留**，要显式 `SHOP_DATASTORE=wsl` 才走。它那套坑（VM 空闲几十秒被回收、网络流量不算会话、~1.2GB vmmemWSL 要挂会话按着）都写在 `scripts/ensure-datastore.mjs` 头注释；真要用得先在 WSL 里 `systemctl enable --now postgresql redis-server` 把端口还回去。
- `apps/server/.env`（gitignored）是 dev 数据面配置的唯一本地来源：口令 `SHOP_DB_PASSWORD` / `SHOP_REDIS_PASSWORD` 与偏好 `SHOP_DATASTORE` 都写这里，接法在 `scripts/dotenv.mjs`（Spring dev 段、seed、e2e、`db:up` 读同一份）。命令行显式导出永远压得过它，删掉那行则回到默认 `remote`，所以 `SHOP_DATASTORE=wsl pnpm db:up` 随时能切到本地退路一次。
