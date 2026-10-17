# 性能测量：Lighthouse CI、体积预算与归因

## Lighthouse CI

`pnpm perf` 构建三端生产产物，再由 Playwright 拉起 preview 服务并跑隔离造数，LHCI 对七个页面各跑三轮。重复采样、聚合、阈值判定和 HTML/JSON 报告归 `@lhci/cli`；项目仅保留场景、逐轮登录和页面有效性插件。CI 里 preview 由 workflow 先起好，Playwright 只连不管，理由见下。

```bash
pnpm dev:server                 # 另一个终端启动本地开发后端，自动连接数据面
pnpm exec playwright install chromium
pnpm perf                       # 生产构建 + 七页 × 三轮
pnpm perf:run --project seller  # 复用当前 dist，仅跑卖家页；务必确认产物没有过期
```

**会通过现有 E2E 接口新建独立测试账号、店铺、商品和模拟订单。** 不调用真实支付；只允许 localhost / 127.0.0.1 / ::1 上的 HTTP 后端。不得把本机后端接到生产库。CI 使用独立 PostgreSQL/Redis 服务；本地遵守 E2E 造数的开发库约定。

运行前关闭占用 4173 / 5000 / 4000 的 preview/dev 服务。本地跑时 Playwright 设 `reuseExistingServer:false`、Vite 设 `--strictPort`，不会拿已经运行的 dev server 冒充生产页面，退出时由 Playwright 收掉它启动的服务。

**CI 里 preview 由 workflow 持有，Playwright 只复用（`reuseExistingServer:true`），不接管收尾。** 它的 webServer 收尾不可中断：`teardown()` 先对自己那个进程组发 SIGKILL，再 `await waitForCleanup` 等子进程 stdio 的 **EOF**，全程没有超时；而 preview 命令是 `pnpm --filter X exec vp preview`，这条链上只要有一个后代没被那次 group kill 带走并仍握着继承来的 stdout，EOF 就永远不来，`playwright test` 永远不返回——实测挂到 step 限时，连 `3 passed` 汇总行都没打印。所以 CI 拆成「三端生产构建 → 拉起三端 preview（不等待）→ 等待就绪 → `pnpm perf:run`」四步，本地仍是 `pnpm perf` 一条命令自建自收。本地不改成复用是刻意的：残留的 preview 会拿旧 dist 冒充本轮产物，性能数字就假了。

### 测量口径与门禁

- 固定移动端模拟、每页三轮串行；同一 runner 只有一个测量 worker，CI 的三端各用独立 runner。浏览器来自项目 Playwright 安装版本。引擎跟随 LHCI 当前锁定的 Lighthouse **12.6.1**，不另装一份 Lighthouse。旧脚本使用 13.x，旧 `baseline.json` 已退役，不跨引擎比较分数。
- **`collect.settings.chromeFlags` 必须是 `--no-sandbox`，不能删。** 指向的是 Playwright 那份 Chromium，而 playwright-core 默认就关沙箱（`chromiumSandbox !== true ⇒ --no-sandbox`），业务 E2E 因此一直是绿的；LHCI 走 chrome-launcher 自己拉起同一个二进制、不带这个参数，在 ubuntu-latest（24.04+，AppArmor 禁非特权 user namespace）上会 FATAL `No usable sandbox!` 并 signal 6，LHCI 只报 `Unable to connect to Chrome` —— 看不出跟沙箱有关。取值必须是字符串（LHCI 侧做 `chromeFlags || ''` 再拼 `--headless=new`）。
- `shop-page-ready` 与 `http-status-code` 是 **error**，以最差一轮判定：最终路径、可见内容、本轮造出的商品/订单/店铺，以及指定业务 API 的成功响应都必须匹配。登录页、错误页、骨架和缺数据即使得分高也失败。
- 原始报告必须包含有效 LCP / CLS / TBT 数值，运行时错误或缺失值仍然失败。
- LCP 2500ms、CLS 0.1、TBT 200ms 目前是 **warn**，取三轮中位数，超线报告但不阻断。它们是初始参考线，不是已验证的项目 SLO；固定 CI 环境积累波动数据后再调整或升级为硬阈值。不用一次性能分数卡提交。
- 每轮由 Lighthouse gatherer 重新登录并注入 cookie，不依赖上轮已经轮换的 refresh token。登录响应与环境变量不进入报告。不得改成“每 URL 只登录一次”的 `puppeteerScript`。

### 文件与报告

| 文件                                           | 职责                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| [pages.json](pages.json)                       | 页面清单、内容条件与关键 API；无账号口令                               |
| [lighthouserc.cjs](lighthouserc.cjs)           | LHCI 原生 collect/assert/upload 配置                                   |
| [lighthouse.config.mjs](lighthouse.config.mjs) | 同版 Lighthouse 的扩展 audit/gatherer                                  |
| [../e2e/perf.config.ts](../e2e/perf.config.ts) | 三端生产 preview、串行运行与造数接线                                   |
| `.artifacts/perf/lighthouse/<app>/`            | 原始 `.lighthouseci`、`reports/manifest.json` 与 HTML/JSON、`lhci.log` |

`reports/manifest.json` 包含每轮报告与代表轮标记。校验失败也尝试导出已采集的报告；完全没采集到样本时只有错误日志。所有报告留在本地或 GitHub Actions artifact（七天），**不上传 LHCI 公共临时存储，不上传含口令的 E2E 造数清单**。

账号与业务造数共用 `e2e/fixtures`；环境覆盖继续使用 `E2E_*` 和 `apps/server/.env`，不往性能配置复制口令。`PERF_*` 是 spec 向采集子进程传递本轮数据的内部变量，不需要手工维护。

旧 `--baseline` / `--samples` / `--preset` / `--pages` 参数不再提供。选端使用 Playwright 的 `--project`，性能结论只对这套场景与固定模拟配置有效，不代替线上 RUM 或压测。

### 验证与 CI

`pnpm test --project scripts scripts/lighthouse-ci.test.mjs` 验证真实 LHCI CLI 的三轮判定、低分警告与无效页失败，以及场景/登录安全边界。`pnpm typecheck:e2e` 检查编排代码。

CI 的 `lighthouse-apps` matrix 按 `web / seller / admin` 分到三个独立 runner，每片从自己的 PostgreSQL/Redis 服务造数，执行 `pnpm perf:run --project "$APP"`。七页各三轮不变：web 9 份、seller 6 份、admin 6 份报告。**不要把本机 `workers` 改成 3 来代替 runner 分拆**：多个 Chrome 争抢同一 CPU 会污染 LCP / TBT，性能数字不能这么加速。

每片仍构建并启动三端生产 preview：Playwright 的 `webServer` 是全局配置，`--project` 只筛选测量、不筛选服务。保留这条现有运行路径，避免为省约 20 秒构建另造一套选端/端口配置，也不复用旧产物。preview 在 CI 仍由 workflow 持有，不重新引入收尾挂死。

- matrix `fail-fast:false`，一端失败不取消其他端的诊断。每片 job 上限 25 分钟、装依赖步骤 16 分钟、采样步骤上限 6 分钟；卡死保留错误与已采集报告。

    **预算是为 apt 限速留的，不能按「正常耗时 ×2」收窄。** 拆分把 `playwright install --with-deps` 的 apt 抽签从 1 张变成 3 张，而 `azure.archive.ubuntu.com` 的下载曾在不同 runner 间出现明显速度差异（限速机制未证实）：2026-10-07 run `37639208994` 里同一个 run 内 i18n 用 25s、e2e 29s、seller 59s，admin 却 **10m53s**（`Fetched 32.5 MB in 9min 47s`，55.3 kB/s），web 那片 14 分钟还没装完就被当时的 15 分钟 job 上限 cancelled。慢的是 apt 的 `mesa-libgallium`（~10.8 MB）和 `fonts-*`；`libgl1-mesa-dri` 实际只有约 38 kB，不是 38 MB。**不是浏览器**（Chrome 186.8 MiB + headless-shell 114.3 MiB 只用了 8 秒）。

    最新 [run 37643101888](https://github.com/gh885/shop/actions/runs/37643101888/job/112866735646) 全绿，但 seller 的安装步骤 **8m30s**、采样只用 **1m19s**；apt 原文 `Fetched 32.5 MB in 7min 53s (68.6 kB/s)`。同轮 web / admin 整个 job 为 **4m45s / 3m56s**，说明采样分拆已生效，长尾仍在系统包下载。

    三个装浏览器的 job（`lighthouse-apps` / `e2e` / `frontend-i18n`）现在都先按「谁引用了 azure 就改谁」扫 `/etc/apt`（`grep -rlI`），把命中的文件里的 **Azure Ubuntu URL** 换成 `https://archive.ubuntu.com/ubuntu`，不写死文件名——apt 的入口可能是 `apt-mirrors.txt`（被 `*.sources` 用 `mirror+file:` 间接引用），也可能是任一 `*.sources` / `sources.list`。`-I` 跳过二进制（`trusted.gpg.d/*.gpg`）。只换主机名，保留套件、组件、签名密钥设置与其他软件源；不禁用校验，不删系统依赖，不动 Playwright 版本。Ubuntu 主镜像也提供 `noble-security`，安全更新套件不用另改。此改动只作用于 CI runner，Windows 本机不动 apt 配置。换源后的 CI 下载速度尚未实测，25 / 16 分钟预算继续保留；不能把「换源」当作稳定耗时保证。

    `frontend-i18n` 的 job 上限只有 15 分钟（正常整轮 1m40s、装依赖 25s），比 `lighthouse-apps` 更紧——它其实是最需要这一条的那个。三处步骤是**刻意重复**的同一段 `run:`：内联在 `run:` 里才能被 actionlint 的 shellcheck 覆盖，抽成 `scripts/*.sh` 或 composite action 就要另外给它们接门禁（前者还要把 shellcheck 加进 `security` job，后者要把 zizmor 的扫描范围从 `.github/workflows` 扩到 `.github`）。改其中一处时记得三处一起改，三份正文应当逐字节一致。

    改完必须**断言 `/etc/apt` 下不再引用 azure**：一处都没改到时不能静默放行，否则会把「换源没生效」误读成「换源没用」。命中为 0 只发 `::warning::`（将来 runner 不再用 azure 时属正常），仍有残留则 `exit 1` 并把文件名打出来。

    `sed` 的定界符**不能再用 `|`**：`s|…|…|` 会把模式里 `([[:space:]]|$)` 的那个 `|` 当成「模式结束」，报 `sed: unknown option to 's'`；`bash -e` 下这一步会直接失败，三个 leg 全红。注意 actionlint / shellcheck **抓不到**这类错（shell 语法合法，是 `sed` 运行时才报），只能靠 CI 或本地沙箱实测。

    换源回滚：删除三处名为「把 Ubuntu 软件源换到官方主镜像」的步骤（`lighthouse-apps` / `e2e` / `frontend-i18n`），保留三端分拆、原安装命令和超时预算。
    不要试图用 `timeout` 砍掉再重试：`--with-deps` 走 `sudo apt-get`，sudo 默认 `use_pty` 会另开会话，`kill -TERM -$pgid` 够不着它，孤儿 apt 会一直握着 dpkg 锁，下一次尝试只会卡在锁上。

    注意 `--failed` 重跑在这个结构下**修不绿**：汇总 job 不依赖某一片、`--failed` 不会重跑它，而非最新 attempt 的 job 又不允许单独重跑（`cannot be rerun`）。所以一片 flaky 之后要恢复绿色，只能整轮重跑。

- 成功/失败报告分别存入 `lighthouse-reports-web/seller/admin`，失败服务日志存入 `lighthouse-failure-logs-web/seller/admin`；名称带端名，避免并行上传冲突，仍不上传账号清单。
- `lighthouse` 只汇总，保留原 **Lighthouse CI production pages** required check 名。`if: always()` 加只接受 `success` 的判定，失败、取消或跳过都不能放行；不需要改已有分支保护设置。尚未设为 required check 的仓库仍需管理员自行设置，本改动不操作远端保护。

耗时依据：[2026-10-07 run 37621294853](https://github.com/gh885/shop/actions/runs/37621294853/job/112791940465) 总计 **8m43s**，采样步骤 **5m47s**；三端串行约 **2m44s / 1m30s / 1m25s**。按原启动开销加最慢一端估算，新路径约 **5–6 分钟**，前提是 runner 不排队；这是估算，推送后才有真实 CI 对照。安装依赖和后端启动重复三份，runner 总分钟数会增加。

本地回归（2026-10-07）：三端生产构建后，依次执行三条 `--project` 命令，21 份移动端报告全部有效（web 9 / seller 6 / admin 6），每 URL 恰好三份；LHCI 回归 24 条通过。工作流 matrix 覆盖全部端，汇总脚本只接受成功状态，失败/取消/跳过均返回非零。临时后端与 preview 已停止；三轮 E2E 造数留在开发库，不自动删数据。

回滚：恢复单个 `lighthouse` job 执行不带 `--project` 的 `pnpm perf:run`，移除 matrix/汇总，恢复原报告名及 25 分钟 job / 12 分钟采样上限；本地命令、采样配置和业务代码不变。

## 产物体积：Size Limit

`pnpm perf:bundle` 构建三端，再由 `size-limit` + `@size-limit/file` 读取 [size-limit.json](size-limit.json)。项目不再维护压缩、阈值比较和退出码实现。

```bash
pnpm perf:bundle                 # 当前代码的完整检查；CI 同一条命令
pnpm perf:bundle:check           # 只检查已有 dist；必须确认它来自当前代码
pnpm perf:bundle:check -- --json # 机器可读的逐项结果
```

- **七项独立预算**：web/client、seller、admin 各有 JS 与 CSS；web/server 单独算 JS。逐文件 gzip（level 9）后求和，包含懒加载 chunk，不重打包。
- **不测什么**：不含 .map、HTML、图片、字体，也不把服务端 JS 当作浏览器下载量。总 JS/CSS 预算不是页面首屏预算；真实页面启动时也可能加载动态 import，必须用浏览器另测。
- **失败条件**：超预算、缺失配置、任一必需 JS/CSS 分组没有匹配文件都返回非零。禁止 `--ignore-missing`；`scripts/size-limit.test.mjs` 对真实 CLI 验证这些行为。
- **预算来源**：每条 = 该类实测 gzip 字节 `ceil(bytes × 1.01)`，约 1% 头寸专门吸收 gzip/minify 的**字节级抖动**——同一 commit 在 CI 与本地实测可差约 30 B，把线卡到字节级会把这种噪声判成违规（2026-10 曾退化成「刚好卡线」，每超一两百 B 就手动抬一次数字，门禁形同虚设）。旧脚本用默认 gzip level 6，新库用 level 9，两者不宣称逐字节等价。**抬线规则**：只有引入新依赖 / feature 让某类真实涨到顶穿这 1% 头寸时，才在同一个 PR 把该类预算重算成新的 `实测 × 1.01` 并写出原因（趋势图入库一次涨 23 KB 属这一类）；小于头寸的字节级超限一律当噪声，**不抬线**。旧基准与自动「重冻」入口已删除，不随当前构建自动抬高。

旧脚本将 sourcemap 计入“合计”、将静态 import 闭包叫作“首屏”；这两项没有保留。新门禁守部署 JS/CSS 的成本，不承诺检查文件引用完整性或每个页面的实际网络流量。历史报告仅供参考，不能直接与新口径混画趋势。

## 模块归因：Visualizer

```bash
pnpm perf:attrib        # 用生产配置构建三端并生成报告
pnpm perf:attrib web    # 只构建 web（另可选 seller / admin）
```

报告写入 `.artifacts/perf/bundle/<app>-<environment>-<template>.html`，直接用浏览器打开。
`treemap` 看模块占比，`network` 追依赖关系；web 的 client / ssr 分开出图，不互相覆盖。

共享 Vite 配置仅在 `SHOP_ANALYZE=1` 时加载 `rollup-plugin-visualizer`；构建编排器只设置这个开关，仍调用各端原有的 `build`（`pnpm --filter <pkg> build`，pkg 为 web / seller / admin），不换 mode 或生产环境变量。普通构建和测试不生成报告。

使用已有 hidden sourcemap 归因。图中的模块体积是分析值，不能按模块压缩后相加冒充 chunk 的传输字节；预算判定只认 Size Limit。Rolldown 合成 runtime chunk 没有 sourcemap 时，Visualizer 会警告并回退到 chunk 级数据。

**报告含源码路径与依赖信息，只留在本地或受限 CI artifact，不进公开静态资源。** 原 `--why`、`--top`、`--no-first-screen` 参数不再提供；对应操作在报告里完成。

## CLS 归因：node scripts/perf-cls.mjs

`pnpm perf` 报一个 CLS 总分和一个「位移节点」，但**不给时刻、不给因果**——于是「首页 0.226 是哪个子元素推的」只能靠猜。`perf-cls.mjs` 补的就是这一段：注一段 `document_start` 的采集脚本，把 `layout-shift` 的 `sources[]`（`previousRect` → `currentRect`）、发生时刻，和同一时间窗内能改到几何的三件事（DOM 变化、CSSOM 规则数、位移节点自己的逐帧矩形）串成一条带时间戳的时间线。

```bash
node scripts/perf-cls.mjs http://localhost:4173/ --label home          # 买家端首页（要后端）
node scripts/perf-cls.mjs http://localhost:4000/audits --preset desktop # 桌面位移诊断；不要与固定移动端 LHCI 混比
node scripts/perf-cls.mjs <url> --cookie refresh_token=<值>@/auth/refresh  # 进工作台的那条 cookie
node scripts/perf-cls.mjs <url> --cpu 4 --net slow4g --out /tmp/cls.json   # 显式限流：复现真机节奏，CLS 会变大，别再和基线比
node scripts/perf-cls.mjs <url> --block picsum.photos/seed/promo           # 因果 A/B：掐掉一类请求，位移没了就是它推的
```

时间线有三层，因为位移的成因有三类，缺一层就会把某一类整个读成「没变化」：

| 看见什么                                             | 能排除什么                     | 看不到什么                               |
| ---------------------------------------------------- | ------------------------------ | ---------------------------------------- |
| DOM 变化（MutationObserver：插入节点的 rect / 高度） | 「有人插了东西」               | 样式生效、图片固有尺寸到达               |
| CSSOM 采样（50ms 一次，sheet 数 / 规则数）           | 「外链样式后到」               | 媒体查询翻转、`@container`（规则数不变） |
| 位移节点逐帧矩形 + `--block` A/B                     | 「同一份样式下几何被内容改了」 | —— 这两层合起来才是兜底                  |

五条口径上的坑，都是踩过之后钉在这里的：

- **默认不限流才是对的**：Lighthouse 导航测量是 `throttlingMethod: "simulate"`——观测阶段不挂任何 CPU / 网络限流，节流由 Lantern 事后模拟；而 layout-shift 是**观测值**，模拟不出来。所以这个脚本默认也不限流，只复刻屏幕模拟（mobile 412×823 DPR1.75 / desktop 1350×940 DPR1，UA 同源，抄 `lighthouse/core/config/constants.js`）。要复现真机才显式加 `--cpu` / `--net`。
- **Chrome 的实现叫 `currentRect`，草案里叫 `nextRect`**：读错名字不抛异常、只静默给 `undefined`，于是每条位移都显示「位移量未知」。属性挂在原型上（`Object.keys(source)` 是空的），所以也别用 `in` 之外的方式猜。
- **先用一个人造位移页验探测器本身**，再拿它下结论：[`perf/fixtures/cls-fit-content.html`](fixtures/cls-fit-content.html) 复现的正是「DOM 和样式表都没动、宽度从 48 跳到满版心」这一类（不需要后端，`--preset mobile` 跑它，只有没带 `w-full` 的 `#a` 位移）。注意 `file://` 上 Chrome 不套设备模拟，视口会报 1028 而不是 412——这页看的是方向与「谁没位移」。
- **`--cookie` 的值要从 `Set-Cookie` 原样取**：admin 那条是 `staff_refresh_token=rt:…`，按 cookie 名长度切片时多删一个字符就变成 `t:…`，后端回 401、SPA 静默弹回 `/login`——而登录页实测 CLS 0.000，看着像「审核台没问题」。工作台那端拿到 0.630 之前先确认 trace 的 URL 还写着 `/audits`。
- **被测页必须在 `vp preview`（生产构建）上跑**，dev server 上位移形状是另一回事：HMR 客户端会插节点、CSS 是运行时注入的。fixture 那一页不算例外——它本来就是一页静态 HTML，没有 dev 才有那些东西。

历史 CLS 排查与复现结论见 [cls-investigations.md](cls-investigations.md)，不与当前 LHCI 指标混作基线。
