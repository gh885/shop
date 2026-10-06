# perf/ — 实验室测量：首屏得分与产物体积

入口：`pnpm perf`（Lighthouse 跑真浏览器，三端 7 个页面）、`pnpm perf:bundle`（构建并用 Size Limit 检查预算）、
`pnpm perf:attrib`（用 Visualizer 生成模块体积与依赖图）与 `node scripts/perf-cls.mjs`
（把一次 CLS 拆成带时间戳的位移和它的因）。
Lighthouse / CLS 参数见各自 `-- --help`；体积与归因命令见下方对应小节。约定与「为什么这么分」在
[docs/conventions/frontend-monitoring.md](../docs/conventions/frontend-monitoring.md) 的「实验室指标」一节，这里只写怎么用。

## 文件

| 文件                         | 跟踪 | 作用                                                                                                                                               |
| ---------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages.json`                 | 是   | 被测页面清单，按 app 分组（端口、登录方式也在这里）。改它 = 换测量口径，改完必须重冻基线                                                           |
| `baseline.json`              | 是   | 对比基准，按 preset 分段。每次跑都打印与它的差值                                                                                                   |
| `history.jsonl`              | 否   | 本机趋势流水，一行一次运行。重跑可得，所以不入库                                                                                                   |
| `runs/<时间戳>/`             | 否   | 每次的 `summary.json` + 逐页 Lighthouse 原始报表（`.json` / 可直接打开的 `.html`），只留最近 20 次                                                 |
| `size-limit.json`            | 是   | Size Limit 原生配置：各端 JS/CSS 的 gzip 绝对预算；不含 sourcemap                                                                                  |
| `../.artifacts/perf/bundle/` | 否   | Visualizer HTML 报告，按 app / Vite environment / template 分文件，不进 dist                                                                       |
| `fixtures/`                  | 是   | CLS 签名的复现页（不需要后端，`node scripts/perf-cls.mjs "file://$PWD/perf/fixtures/…" --preset mobile` 直接跑），用来验探测器本身而不是验业务代码 |

## 常用几条

```bash
pnpm perf                                  # 三端逐个构建 + 起服务 + 7 个页面 × 3 轮，实测 4 分 22 秒
pnpm perf -- --no-build --pages home       # 只量首页、复用产物，改一处看一处的迭代节奏
pnpm perf -- --pages welcome               # 静态页单独量：这条不需要后端
pnpm perf -- --apps seller                 # 只量一端（端口要被腾出来，见下）
pnpm perf -- --baseline                    # 冻基线（要全量 + ≥2 轮，否则拒绝，见下）
```

前置：后端在 8080（`pnpm dev:server`）。不在场时脚本直接拒绝——SSR 页会出空壳，而**空壳页可能拿高分**，那是最坏的一种假数。

## 三端各自的端口，以及为什么不能换

| 端       | preview 端口 | 换得了吗 |
| -------- | ------------ | -------- |
| `web`    | 4173         | 能，随便 |
| `seller` | 5000         | **不能** |
| `admin`  | 4000         | **不能** |

后端 CORS 白名单（`apps/server/src/main/resources/application.yml` 的 `shop.web.cors-allowed-origins`）只认
`localhost:3000,5173,4000,5000`。preview 换个端口，浏览器里 SPA 自己发的那个 `POST /auth/refresh`
就吃 `403 Invalid CORS request`，页面停在校错误态——而它照样能拿个不错的分。买家端逃过这一条是因为它是
SSR：取数发生在服务端，没有浏览器跨域这一步。所以这两端的端口是**配置而不是偏好**。

由此得到一条操作前提：**跑之前把对应的 dev 服务关掉**（`pnpm dev:seller` 占 5000、`pnpm dev:admin` 占 4000）。
脚本用 `--strictPort` 起 preview，端口被占时它拒绝并点名是哪一端、该关什么，不会静默漂到别的端口上量一个 CORS 全红的页面。

## 工作台是登录后才有的页面，所以「进门」是测量的一部分

`seller` / `admin` 的 `/_app` 挂着 `beforeLoad: requireAuth`，没登录时它 302 到 `/login`——而登录页是一张干净的表单，
LCP 短、JS 少，能拿个很好看的分。**这是本项目最容易被忽略的一种假数**，所以脚本在每轮跑完都断言最终 URL 没落回
`loginPath`，落回去了直接失败而不是记录。

进去的链路比想象的绕，三条各自都是踩出来的：

1. **access token 只在内存里**（`packages/common/src/contract/auth-kit.ts` 的模块级变量），刷新页面就没了，
   靠 `beforeLoad` 拿 httpOnly 的 refresh cookie 换回来。所以能给的入场券只有那枚 cookie。
2. **Lighthouse 的 `extraHeaders` 装饰的是它自己发的请求**，页面里那个 `POST /auth/refresh` 是浏览器的 fetch，
   不带它——实测加了 header 仍然停在登录页。唯一走得通的口子是往 Chrome 的 cookie jar 里塞：
   经 CDP `Network.setCookie`（手写约 20 行，不为此加一个依赖），并配 `disableStorageReset` 让它别被清掉。
   参数里必须用 `url:` 而不是 `domain:`+`path:`，localhost 上后者会被 jar 静默丢弃。
3. **每一轮都要重新登录、重新注入**：refresh token 是一次性轮换的，而轮换出来的新 cookie 带 `Secure`，
   浏览器在 `http://localhost` 上不肯存它。于是第二轮开始手里那枚已经是作废的旧值。

清单里的账号是 `seed:demo` 灌进去的公开演示号，只对本地后端有意义。脚本对此有一道硬闸：
要量的端里有工作台而后端不是 localhost 时，直接拒绝并让你改用 `--apps web`。

## 读输出

- **得分**就是 DevTools / PageSpeed 那四个圈。**指标**是逐轮中位数，`↑/↓` 读作「变好/变差」。
- `⚠` 标在越过官方「良好」上限的指标上（FCP 1.8s / LCP 2.5s / CLS 0.1 / TBT 200ms / SI 3.4s）。
  它和 `↑/↓` 是两回事：后者跟**上一次**比，前者跟**及格线**比——基线没冻过的页面、或冻的时候就已经烂的页面，
  差值那一栏什么都不印，页面照样能拿个不难看的分。CLS 那两条（首页 mobile 0.226 / 审核台 desktop 0.630）已经修掉，
  现在在场上的 `⚠` 只剩 FCP / LCP / SI，归因见「已知噪声源」那节。
- 每页下面那行 `波动` 是本轮 LCP 的逐轮值和极差。**差值小于本轮极差时别当真**——同一份产物连跑三次，首页 LCP 实测 5862 / 5863 / 6603ms。脚本已经吞掉 50ms 以下的差值，但 50ms 只是下限，不是噪声上限。想量「代码变了没有」而不是「机器今天忙不忙」，用下面那节 `pnpm perf:bundle`。
- `待办` 是 Lighthouse 预估收益最高的几项，将来做优化时这就是清单。当前买家端三页共同的第一名是
  `unused-javascript`（~1.3–1.7s），商详还有一条 `redirects ~600ms`（`/products/$id` 会 307 到 `?spec={}`）。
  工作台那一组通常整行不出现（预估收益全是 0 就不印），偶尔冒出来一条也是 ~160ms 量级——别把它读成「没报出来」。
- `报表` 指向可以直接用浏览器打开的那轮 HTML。它指向的是 **LCP 最接近中位数的那一轮**，不是最好也不是最差的一次。

## 什么时候要重冻基线

- 改了 `perf/pages.json`（换了页面、换了钉住的商品 ID、换了端口或账号）
- 换了机器、或换了浏览器版本
- 一轮有意的优化落地之后（否则基线会一直把已修掉的差距算成待办）

`--baseline` 在两种情况下会拒绝并说明原因：轮数 < 2（单轮的波动就是噪声本身），或 `--pages` 只覆盖了清单的一部分（覆盖写会把基线里其它页面静默清掉）。

## 已知噪声源

- **第一轮普遍偏慢**：Chrome 冷启动。3 轮取中位数就是为了压它，`--samples 1` 只用于快速迭代，别拿来比。
- **工作台的第一轮不只是冷启动**：还叠了登录和首次进页取数，偏得多——实测卖家商品管理三轮 LCP
  5856 / 1960 / 1959ms，管理端审核台 3769 / 1510 / 1507ms。中位数正是为此而取；`--samples 1` 量工作台
  会拿到一个比真值慢三倍的数。
- **图片走 picsum.photos 外链**，Lighthouse 真去公网取图，网络抖一下 LCP 就抖。但**这两条外链不是一个来源，缓解路径也不同**：
    - 首页与商详的图来自 `seed:demo` 的商品行（完整 URL）。`imgUrl` 对已是完整 URL 的输入原样返回（`packages/app-kit/src/display/image.ts:37`），所以外链一路透到浏览器。这条在 **LCP** 上属于「实验室自己的影子」——prod 的 Flyway 只加载 `db/migration`，不含 `db/seed`（`application-prod.yml`），真图是相对 key 拼 CDN 域名，换对象存储后自然缓解。但**同一批图的固有尺寸晚到曾是首页 CLS 0.226 的扳机，那一条不是实验室影子**：换成自家 CDN 也一样要在图落地那一刻重排，区别只是窗口大小（机制见下「两条位移：定性 → 修掉 → 复测」；修的是版心自己声明宽度，所以图落地不再推动版心，但固有尺寸本身仍是 LCP 议题）。
    - `/welcome` 与 `/sell` 的图是**源码里硬编码的 picsum URL**（`apps/web/src/routes/welcome.tsx:70-74`、`routes/sell/index.tsx:97-139`），不走 `imgUrl`/`VITE_IMAGE_BASE_URL`。这条**换存储缓解不了**，要动的是那两个页面本身。而 `--pages welcome` 是唯一不依赖后端的一条，也是体积首屏探针（`probe: "/welcome"`）——它一旦在公网抖，最容易被误读成「构建变了」。
    - 口径：这三条外链只说明 LCP 的**抖动**，不说明它的**高低**（占位图 38–50KB，比真商品图小）；那两条 CLS 反过来，**换存储不会自己消失**——它们是改代码改掉的（见「两条位移：定性 → 修掉 → 复测」）。要归因到「首屏里该拆谁」用 `pnpm perf:attrib`，要归因到「哪一帧把谁推走了」用 `node scripts/perf-cls.mjs`，别拿外链页面的分数当代码证据。
- 本地测量会把机器负载算进结果：**跨机器、跨时段不可比**，只和同机器的上一次与基线比。

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
node scripts/perf-cls.mjs http://localhost:4000/audits --preset desktop # 工作台（口径同 perf 的 desktop）
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

## 两条位移：定性 → 修掉 → 复测

**首页 0.226：版心宽度跟着 banner 图的固有尺寸走。** 一次位移，`section` 从 `x182 w48` 变成 `x0 w412`（高不变），窗口内 **DOM 零变化、CSSOM 零变化**——这不是「有人插了东西」，也不是「样式后到」。链路是四步：

1. `routes/index.tsx:61` 的版心是 `mx-auto flex max-w-page px-6`——**没有 `w-full`**；
2. 它是 `main.flex.flex-1.flex-col` 的**交叉轴** item，而 auto margin 会把 `align-items` 的 `normal`(stretch) 降级成 `flex-start`（Flexbox §9.2），于是 `width:auto` 取 **fit-content** 而不是撑满；
3. fit-content 跟着内容的 max-content 走，而那一节里唯一有尺寸的子是 banner 的 `<img>`：`Image` 不写 `width`/`height` 属性，`HomeBannerItem` 也没传 `ratio`（没有 `aspect-ratio`），图的 `w-full` 又是个百分比——固有尺寸没到之前，它对 max-content 的贡献是 0；
4. 于是首屏那一刻版心只剩 `px-6` 的 24+24 = **48px**；两张 promo 图 1302ms 落地，1314ms 版心跳到 412px，banner 上那层文字覆盖块顺带从 `39×200` 变成 `364×74`。

**A/B 证据**：`--block picsum.photos/seed/promo` 只掐那三张 banner 图 → **CLS 0.000，计入 0 条**（其余请求照常）。

修的是第 2 步，不是第 3 步：**版心一律自己声明宽度**（补 `w-full`，买家端 15 处含 `styles.css` 那条 `@apply`，卖家端占位页 1 处）。两个理由：

- 这条规则**不需要逐处判断父级**。`mx-auto` 只在 flex/grid 交叉轴 item 上才降级成 fit-content；对块级子元素，`width:auto` 本来就填满，`w-full` 是惰性的。所以「一律补上」在所有位置都不会改变现有布局，而逐处问「这里的父是谁」一定会漏一处——漏的那处就是这次的 48px。
- 给图钉 `ratio` / `width`+`height` 只救被掐掉的那三张。同一机制换任何一个「固有尺寸晚到的子元素」（图标字体、异步广告位、晚到的 `@font-face`）都会再犯一次，而那类东西在买家端页面上只会越来越多。

图的固有尺寸本身仍是要做的事（它同时是 LCP 的一条），但 `packages/ui-web` 的 `Image` 这次没动：宽度不再跟着内容走之后，它缺固有尺寸只影响图自己占的那块高度，不再影响版心。

**admin 审核台 0.630：权限到位后追加的那条二级侧栏。** 也是单条位移（t=779ms，占 100%），内容列从 `x96 w1254` 推到 `x272 w1078`——**横移 176px，正好等于同一帧插进来的 `aside.w-44` 的宽度**。同一窗口里图标栏（`aside.w-24`）还多插了一个 `li`。CSS 早在 69ms 就齐了、CSSOM 之后没再动，所以和壳无关、和图无关：**侧导航是按权限异步装配的**，先渲染只有图标栏的窄壳，权限回来后整条二级栏插进去把正文推走。

修的是「栏会不会存在」这件事的首帧占位，不是给内容列加过渡：`WorkbenchSidebar` 多一个 `pending` prop，为真时**两列照常渲染、列内换成骨架**（`SidebarRailSkeleton` / `SidebarPanelSkeleton`，与真组件共用同一组 `RAIL_*` / `PANEL_*` 常量，所以占位宽度和行高不可能和实物对不上）。骨架之所以 shift-safe，是因为两件事都不动几何：往一条**已有固定宽度**的空列里插条目不移动任何已存在元素；骨架行与真实行同高（32px 一个 pitch），替换时 y 不变——于是最终有几条菜单、什么时候到，都不影响结果。
admin 侧的判据是「已登录、且首份 me 没落地、且没失败」（`apps/admin/src/layout/app-sidebar.tsx`）：未登录本来就该只有窄栏（登录页没有二级菜单），me 失败按无权限视图渲染，这两种情况占一条永远不会出现的列反而是新的位移。
没有选「在 `_app.beforeLoad` 里等 me」：那会把一次 RTT 串在页面内容取数之前，而审核台正是三端里首屏最慢的那一页。

**复测**（`pnpm perf -- --no-build --pages home,admin-audits`，`--samples 2`，两个 preset 各一轮）：

| 页面         | preset  | CLS               | 性能分              |
| ------------ | ------- | ----------------- | ------------------- |
| 买家端首页   | mobile  | 0.226 → **0.000** | 52 → **66.5**       |
| 买家端首页   | desktop | 0.073 → **0.003** | 90 → **92**         |
| 管理端审核台 | mobile  | 0.163 → **0.000** | 93 → 89（LCP 噪声） |
| 管理端审核台 | desktop | 0.630 → **0.000** | 77 → **99.5**       |

历史记录（旧脚本静态依赖口径，不代表真实页面加载量）：**三端静态入口 JS 依赖合计一个字节都没涨**（web 332KB / seller 233KB / admin 214KB，与基线同样），两个骨架组件带来的 598B（gzip）落在 admin 的**总量**里——首屏是 HTML 入口的静态闭包，而侧栏在 `/_app` 那条懒块上，所以这 598B 是进工作台才下载的。也就是说这不是「拿体积换 CLS」。
`perf-cls` 侧另有 home 3 轮 + CPU/网络限流 1 轮、admin desktop 3 轮 + mobile 限流 1 轮，全部 0 条计入。
**同一处改动顺手清了第三条**：店铺管理（`/shops`）此前 desktop 0.116 / mobile 0.163，现在两边都是 **0.000**——它的位移和审核台是同一条（二级列等权限才插进来），当初只是没被单列出来。

基线已按这两轮全量（7 页 × 3 轮 × 两个 preset）重冻：`pnpm perf -- --baseline --preset mobile` / `--preset desktop`，所以现在打印的差值对的是修完之后的尺子，不再把 0.630 当成待办。**冻进去的代价要说清楚**：卖家工作台两条的 LCP 在这一版比上一版慢约 760ms（本轮中位数 2.72s，上一版 1.96s），与这次的 CLS 修复无关（卖家端菜单是静态的，`pending` 从不传），本轮三轮里的第一轮 4974ms 是冷缓存那一轮，极差 2251ms。下一次读基线的人看到的「卖家变慢」是这台机器今天的负载，不是我改出来的。

残余一条**不计分**的：顶栏那枚用户 chip 在 me 落地时从 140→150px（纯横移，1350 视口上贡献 0.0000）。它不推动任何列宽，所以没为它占位；哪天它涨到计得进分数，做法与侧栏同一条——首帧给宽度，而不是等内容。

**desktop 首页还剩 0.0034，我没有动它**，理由是它没被定性。一条位移，t≈259ms（水合期）：`section.feed-section` 从 y402 → y410，同时自身高度 538 → 530，吸顶栏的 `feed-divider` 一起下移 8px，栏里那枚 28×28 的翻页按钮下移 4px——即「吸顶栏那一带长高 8px」，而**宽度那条链路已经与它无关**（版心宽 1335px 前后没动）。按上面那条口径试过一次归因：把词条 chip 的高度（`text-base` 24 + `py-1.5` 12 = 36px）预先占进骨架帧，重测**一位小数都没变**（0.0034 / t=259 一模一样），于是把那次改动撤了——量不出来的修法就是猜的。窗口内 155 条 DOM 变化且单帧上限丢了 1 条，owner 钉不到唯一，按「没有 trace 就不许改」停在这里；要接着查，先给 `perf-cls.mjs` 的 `--wait` 与单帧上限松绑，别急着动页面。mobile 同页四轮实测 0.000，所以它只在 1350 宽出现。

这两条的对照面仍是「壳层干净」：后端不在场时 `/audits` 弹回 `/login`，desktop 实测 CLS 0.000——所以当年的 0.630 全部来自登录后那片区域，范围从一开始就不在整个 app。

## 位移不再靠人记着（回归闸）

- `packages/common/src/page-shell-width.test.ts`：扫全仓所有 class 字符串（含 `@apply` 那一路），带 `mx-auto` + `max-w-*` 却没声明宽度的就点名。**它是拼写级的**——读 class 串不读计算样式，所以它保证的是「没人漏写」，不是「布局一定不塌」；兜住后者的是上面那条规则本身。
- `packages/app-kit/src/shell/workbench/sidebar.test.tsx`：pending 那一帧的列宽 == 权限落地后的列宽（jsdom 不排版，类名就是列宽的唯一真相）。
- `apps/admin/src/layout/app-sidebar.test.tsx`：装配层的判据——用一条可控延迟的 `me` 响应把 pending 帧钉住，再断言两列宽度不随权限到达而变。
- `apps/admin/src/layout/nav.test.ts`：`NAV_ITEMS` 的入口全是分组、没有顶层叶子。这条是 `pending` 敢按「两列都占」的前提；哪天加了顶层叶子入口，占位就得改成按路由判定，这两条测试会先红。

## 当前基线（e6aebb6e + 工作区）

`web/client` JS 667KB（首屏 332KB）· `web/server` 780KB · `seller` 579KB（首屏 233KB）· `admin` 439KB（首屏 214KB）。

首屏那三个数字是 2026-09-29 一轮 tree-shaking 修复后的结果：买家端首屏 568KB → 332KB（−237KB，预加载链接 63 → 40 个），改的是 `packages/{api,ui-web,app-kit}` 与 `apps/{web,seller,admin}` 的 `sideEffects` 声明、以及把登录弹窗真正切成懒块（此前 `lazy()` 无效，因为同一个 barrel 被静态引了）。**规则与论证在 [frontend.md](../docs/conventions/frontend.md)「打包体积」**——那节此前说「barrel 不挡 tree-shaking」，那是只对 `packages/*` 成立的一半。
