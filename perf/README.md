# 性能测量：Lighthouse CI、体积预算与归因

## Lighthouse CI

`pnpm perf` 构建三端生产产物，再由 Playwright 管理 preview 服务与隔离造数，LHCI 对七个页面各跑三轮。重复采样、聚合、阈值判定和 HTML/JSON 报告归 `@lhci/cli`；项目仅保留场景、逐轮登录和页面有效性插件。

```bash
pnpm dev:server                 # 另一个终端启动本地开发后端，自动连接数据面
pnpm exec playwright install chromium
pnpm perf                       # 生产构建 + 七页 × 三轮
pnpm perf:run --project seller  # 复用当前 dist，仅跑卖家页；务必确认产物没有过期
```

**会通过现有 E2E 接口新建独立测试账号、店铺、商品和模拟订单。** 不调用真实支付；只允许 localhost / 127.0.0.1 / ::1 上的 HTTP 后端。不得把本机后端接到生产库。CI 使用独立 PostgreSQL/Redis 服务；本地遵守 E2E 造数的开发库约定。

运行前关闭占用 4173 / 5000 / 4000 的 preview/dev 服务。Playwright 设置 `reuseExistingServer:false`，Vite 设置 `--strictPort`，不会拿已经运行的 dev server 冒充生产页面；退出时由 Playwright 收掉它启动的服务。

### 测量口径与门禁

- 固定移动端模拟、三轮串行；浏览器来自项目 Playwright 安装版本。引擎跟随 LHCI 当前锁定的 Lighthouse **12.6.1**，不另装一份 Lighthouse。旧脚本使用 13.x，旧 `baseline.json` 已退役，不跨引擎比较分数。
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

`pnpm test:project scripts scripts/lighthouse-ci.test.mjs` 验证真实 LHCI CLI 的三轮判定、低分警告与无效页失败，以及场景/登录安全边界。`pnpm typecheck:e2e` 检查编排代码。

CI 的 `lighthouse` job 从空数据库迁移并造数，运行 `pnpm perf`，保存成功与失败报告。此 job 新增后，如需合并前强制要求它通过，还要在远端分支保护中设为 required check；本改动不修改远端仓库设置。

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
- **预算来源**：从旧基准提交 `17f8121e`（2026-10-05T16:40:28.597Z）的逐类 JS/CSS gzip 字节取 `ceil(bytes × 1.05)`。旧脚本用默认 gzip level 6，新库用 level 9，两者不宣称逐字节等价。旧基准与自动“重冻”入口已删除；加预算必须在同一个 PR 写出原因，不随当前构建自动抬高。

旧脚本将 sourcemap 计入“合计”、将静态 import 闭包叫作“首屏”；这两项没有保留。新门禁守部署 JS/CSS 的成本，不承诺检查文件引用完整性或每个页面的实际网络流量。历史报告仅供参考，不能直接与新口径混画趋势。

## 模块归因：Visualizer

```bash
pnpm perf:attrib        # 用生产配置构建三端并生成报告
pnpm perf:attrib web    # 只构建 web（另可选 seller / admin）
```

报告写入 `.artifacts/perf/bundle/<app>-<environment>-<template>.html`，直接用浏览器打开。
`treemap` 看模块占比，`network` 追依赖关系；web 的 client / ssr 分开出图，不互相覆盖。

共享 Vite 配置仅在 `SHOP_ANALYZE=1` 时加载 `rollup-plugin-visualizer`；构建编排器只设置这个开关，仍调用原有 `build:web/seller/admin`，不换 mode 或生产环境变量。普通构建和测试不生成报告。

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
