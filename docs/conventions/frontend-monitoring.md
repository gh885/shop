# 前端监控约定

- **状态**：实验室侧已落地三条——`pnpm perf`（Lighthouse）、`pnpm perf:bundle`（产物体积，模块级归属由 `pnpm perf:attrib` 接住）与 `node scripts/perf-cls.mjs`（位移归因），见「实验室指标」一节；**RUM 发送侧已全部落地**（单一出口 `captureError`/`track`、事件信封、`sendBeacon` 传输、全局监听、PV、接口事件、Web Vitals、白屏检测、hydration 失败、sourcemap hidden），三端 router 均接上 `defaultOnCatch`。**接收端未上线**，所以 `configureMonitoring` 默认 `enabled: false`（装了没地方收只是白发事件）。SSR 服务端渲染错误待接收端落地时再做
- **日期**：2026-09-27，实验室指标一节补于 2026-09-29（同日再加产物体积一条），RUM 发送侧落地与位移归因一条于 2026-09-30（同日两条 trace 到手、首页与审核台各自的位移源定性）

目标对标阿里的 1-5-10：**1 分钟发现、5 分钟定位、10 分钟恢复**。监控只管前两个数字，恢复靠灰度、回滚和预案（回滚前提见 [production-readiness.md](../release/production-readiness.md)「发布与回滚」）。后端对应的约定是 [business-event-logging.md](business-event-logging.md)。

## 原则：契约一次定对，组件跟着量长

两类代价不对称：

- **缺的数据补不回来**：没带版本号的报错，永远查不出是哪次发布引起的；漏存 sourcemap 的版本，线上堆栈基本还原不了
- **多搭的组件天天要养**：消息队列、流计算、时序库，每个都要部署、升级、再给它配监控；没有真实流量时猜不准瓶颈，提前搭的很可能搭错

判据：**晚半年再做，会不会丢掉补不回来的数据，或者要改所有调用方？** 会，归入「契约」，第一条上报之前定死；不会，再看现在需不需要——需要的进「首批功能」，不需要的进「延后项」，写下触发条件等着。

## 契约

1. **事件信封**：每条上报都带 `app`（web / seller / admin）、`version`、`env`、`session_id`、`user_id`（已登录时）、`route`、`ts`、设备维度、`schema`（信封版本）、`sample_rate`
    - `version` / `env` 与后端信封同名（GEN-48），前后端按同一套字段检索
    - `session_id` 在标签页首次加载时生成、存 `sessionStorage`：刷新不变，新标签页换新
    - `route` 取路由模板（保留 `$id` 这类占位），不取实际 URL
    - `sample_rate` 记上报当时的采样率：以后调了采样，历史数据仍能按比例还原成真实量
2. **请求关联**：沿用 GEN-35 / GEN-36 的 `x-request-id`——前端每个请求自带，后端落 MDC `trace_id`，错误信封里回填为 `requestId`。接口类事件带上它，前端报错能一跳到后端日志。它与 W3C trace-id 同为 32 位 hex，将来接 OpenTelemetry 直接复用，不另起 ID
3. **单一出口**：业务代码只调自己的出口函数（如 `captureError` / `track`，放 `packages/common`，三端共用），不直接依赖第三方 SDK；上报发往自己域名下的固定路径。换监控后端时，改动收在一个文件加一层转发。接入时这些锚点一并改走出口：
    - web 的 `reportError`（`apps/web/src/shared/lib/report-error.ts`）只做 web 特有的一步适配（区分 hydration 失败 vs 普通渲染错），实际出口是 `@shop/common` 的 `captureError`；seller / admin 的 `defaultOnCatch` 同样直接指 `captureError`（两处 router.tsx）
    - 契约漂移的 `console.error` 锚点（`packages/common/src/sdk-client.ts`，GEN-28）已改走 `captureError`（控制台那行保留，给人看）
    - [i18n.md](i18n.md) 约定的缺 key 上报已接（`packages/app-kit/src/i18n/provider.tsx` 降级分支）
    - FUT-02 的曝光 / 点击上报落地时复用同一传输与信封，不另起一套
4. **版本与 sourcemap**：`version` 构建时注入（建议 git sha）。sourcemap 用 Vite `build.sourcemap: "hidden"` 生成（产物里不留 `sourceMappingURL`），按 `version` 归档，不随静态资源发布。**三端 vite.config.ts 已配 hidden**（`build: { sourcemap: "hidden" }`）；`version`/`env` 由 `VITE_APP_VERSION` / `VITE_APP_ENV` 注入（缺省 dev）
5. **隐私边界**：不采输入框内容、密码、token；URL 的 query 与 hash 不采（可能带 token 或个人信息）；手机号只以 `maskPhone` 形态出现（GEN-51）；会话回放如果引入，默认遮罩全部输入与文本

## 首批功能

「按需」的「需」按业务判断，电商里以下几项第一天就算需。**发送侧五条已全部落地**（接收端未上线，默认不发）：

- **PV** ✅ 每次路由切换报一条（`onResolved` 订阅，模板化在出口做）。它是错误率、白屏率的分母，也是将来漏斗监控的底数
- **JS 异常** ✅ 捕获阶段监听 `error`（连带资源加载失败）、`unhandledrejection`、路由错误边界（三端 `defaultOnCatch`）。跨域脚本要加 `<script crossorigin>`，CDN 还得回 `Access-Control-Allow-Origin`，否则只拿到 `Script error.`
- **页面级失效** ✅ seller / admin 是 SPA，做白屏检测——加载后在水平、垂直中线上各取 9 个点调 `elementFromPoint`，全落在 html / body / 根容器上就判白屏。web 是 SSR，首屏有 HTML，要盯的是 hydration 失败（看着正常、点不动）——已在 `report-error.ts` 按消息特征单列事件名。⏸ **SSR 服务端的渲染错误不经过浏览器**，要单独捕获：需要服务端侧的传输（当前出口是浏览器 `sendBeacon`）且全局 request middleware 会改变 SSR 错误响应的状态码语义（TanStack issue #6796），两者都留到接收端落地时一并做；现阶段这类错误仍只进服务端日志（后端结构化日志已覆盖）
- **接口** ✅ 已接：`sdk-client` 的响应拦截器报成功（仅 `response.ok`）、错误拦截器报失败（5xx / 4xx / 网络层 `status:0` / 2xx 但契约漂移）。两条对称规则钉在 `api-events.test.ts`：**成功与失败各只报一次**（两个拦截器都经过，不对称就会一条请求报两条、错误率翻倍）；401 刷新后重放成功的不计。`endpoint` 走 `toRouteTemplate` 模板化（真实路径带 id，无界）。`setMonitoringUser` 也已接：`createMeQuery` 新增可选 `userIdOf`，me 变化时自动填/清信封里的 `userId`（登出即清，不靠各端记得调）
- **Web Vitals**（仅 web）✅ LCP / INP / CLS 看 p75（原生 `PerformanceObserver`，零新依赖），买家端性能直接影响转化，基线要从上线第一天攒

接收端选型是可逆决定（有单一出口兜着），实现时再定：

- **Sentry / GlitchTip**：错误聚合、sourcemap 还原、版本追踪、告警都是现成的；GlitchTip 比 Sentry 自建轻得多
- **后端加接收接口**：前端事件打成 ECS JSON，和后端事件进同一个检索、按 `trace_id` 直接关联；顺手计 Micrometer 指标，告警与后端共用 Prometheus + Alertmanager（business-event-logging.md 的延后项）。sourcemap 还原和指纹聚合要自己做

## 实验室指标：已落地三条（Lighthouse + 产物体积 + 位移归因），但不替代上面那条

首屏性能有两套测量，问的是两个问题，**不能用一套的答案顶另一套**：

|              | 实验室（合成监控）                 | RUM（真实用户监控）                          |
| ------------ | ---------------------------------- | -------------------------------------------- |
| 回答什么     | 这次改动让首屏变快还是变慢         | 真实用户实际承受什么                         |
| 条件         | 固定机型、固定节流、可复现         | 真机真网真用户，不可复现但覆盖面真           |
| 什么时候有数 | 每次改动，构建产物一出来就有       | 要有部署、要有流量                           |
| 量得到什么   | LCP / CLS / FCP / TTFB / TBT / SI  | 同上 **+ INP**（实验室没有真实交互，量不到） |
| 抓得住什么   | 回归：多出来的 300KB、多一跳重定向 | 实验室永远抓不到的：长尾设备、真实网络、地域 |

落地的是左边那套：`pnpm perf`（`scripts/perf-lighthouse.mjs`，用法与噪声说明见
[perf/README.md](../../perf/README.md)）。它量的是 `perf/pages.json` 里逐端的**生产构建 + preview 服务**
（买家端 SSR + 两端工作台 SPA），逐指标取多轮中位数，和 `perf/baseline.json` 比差值。

四条已经付过学费的硬口径：

1. **绝不在 dev server 上量。** 同一页面同一台机器，dev 39 分 / 生产构建 65 分——dev 不压缩、不拆包、
   带 devtools，那个 39 里绝大部分是工具链而不是页面。基线一旦掺进 dev 数字，后面每次优化都在跟噪声较劲。
2. **后端不在场就拒绝测量。** 首页与商详是 SSR，没有后端会渲染出空壳，而**空壳页可能拿高分**——这是所有
   假数里最坏的一种，因为它看起来像好消息。所以脚本先探后端、再验每页的渲染标记，任一不过就不跑。
3. **换页面清单等于换尺子。** 基线按 `preset` 分段存，`--baseline` 拒绝只量子集或只跑单轮的测量，
   免得覆盖写把可比性悄悄弄丢。
4. **工作台量成登录页，是第 2 条换了个脸的同一个坑。** SPA 的 index.html 永远是壳，marker 判据在这里失效，
   所以那两组改用「最终 URL 没落回 login」断言；登录态本身经 CDP 往 cookie jar 里塞 refresh cookie——
   链路上有三个只有实测才知道的断点（access token 只在内存、Lighthouse 的 `extraHeaders` 不装饰页面自己的
   fetch、轮换出来的新 cookie 带 `Secure` 因而在 `http://localhost` 上存不住 → 每轮重新登录）。
   细节与端口为什么不能换（后端 CORS 白名单按端口认人）记在 perf/README，这里只钉口径。

现阶段**只记录、不阻断**：分数再低也退 0，只有测量本身没做成才非 0。接进 CI 当卡口的触发条件：
基线跑满一个月、且移动端性能分修到值得守的水位之后（在那之前设硬阈值只会让每个 PR 都红，
而全红的门禁等于没有门禁）。CI 侧还差一步：现在 e2e job 起的是 dev server，接性能门禁要先加
「生产构建 + preview」这一段。

延后项表里那条「拨测」和这一条不是一回事：拨测定时跑**核心链路**（下单、支付），抓的是功能失效；
实验室性能跑的是**固定几个页面的指标**，抓的是回归。两者共用无头浏览器那一层，但目的与判据都不同。

新增的两个依赖（`lighthouse`、`chrome-launcher`）只被 `scripts/perf-*.mjs` 引用（测量那条是
`perf-lighthouse.mjs`，位移归因那条只用 `chrome-launcher` + 裸 CDP），`apps/*` 与
`packages/*` 一个都不碰——和契约第 3 条同一个道理：将来换测量引擎，改动收在这几个文件。

### 位移归因：CLS 的总分不是解释

`node scripts/perf-cls.mjs`（只用 `chrome-launcher` + 裸 CDP）。加它是因为 Lighthouse 给的是分数加「位移节点」，
**不给时刻、也不给因果**，于是 0.226 这种数只能靠猜着改。这条把 `layout-shift` 的 `sources[]`
（`previousRect` → `currentRect`）、发生时刻，和同一时间窗内能改到几何的三件事（DOM 变化、CSSOM 规则数、
位移节点自己的逐帧矩形）串成一条带时间戳的时间线，再配 `--block <URL>` 做因果 A/B。用法在 perf/README，这里是三条口径：

1. **观测阶段不限流才对得上 Lighthouse 的数。** 它导航测量用 `throttlingMethod: "simulate"`——CPU / 网络节流由
   Lantern 事后模拟，而 layout-shift 是**观测值**、模拟不出来。所以要复刻同一个数，就得同样不限流 + 同一套
   屏幕模拟（mobile 412×823 DPR1.75 / desktop 1350×940 DPR1，抄 Lighthouse 自己的常量）。显式加限流量出来的是
   另一件事（真机节奏），那个数不能再和基线比。
2. **Chrome 的实现叫 `currentRect`，草案里叫 `nextRect`。** 读错名字不抛异常、只静默给 `undefined`，症状是每条
   位移都显示「位移量未知」。合成测量里这类静默失败是默认怀疑对象——**先用一个人造位移页验探测器本身**
   （`perf/fixtures/`），再信它对真页面给出的结论。
3. **一条位移要分到三层里的一层，不能只盯 DOM。** MutationObserver 看不见样式生效，更看不见「图片固有尺寸到达」——
   后者会让版心在 DOM 和样式表都没动的情况下从 48px 跳到满宽。所以判据是：窗口里有 DOM 变化 → 插内容；
   CSSOM 规则数在位移 ±150ms 内变了 → 样式后到；**两者都没有 → 用 `--block` 掐可疑请求做 A/B**，
   位移消失就是它。跳过这一步就会把「插内容」的修法（占位、锁高）套到一条固有尺寸的位移上，白花力气。

两条 trace 的结论与复现命令记在 [perf/README.md](../../perf/README.md)「两条位移：定性 → 修掉 → 复测」：
买家端首页 0.226 是**版心宽度跟着 banner 图的固有尺寸走**（`mx-auto` 的 flex item 缺 `w-full` ⇒ 宽度取 fit-content），
管理端审核台 0.630 是**权限到位后追加的二级侧栏把正文推走**（横移 176px = `aside.w-44` 的宽度）。
两条都由 A/B 或复现页钉死，不是推断；两条现在都已修掉（复测 CLS 0.000），修法的规则面落在
[frontend.md](frontend.md)「布局」那节，回归闸由 `page-shell-width.test.ts` 与侧栏那三条测试守着。
**这份约定只负责「没有 trace 就不许改」**——修哪一条、什么时候修，仍然是独立的决定。

### 产物体积：实验室里唯一没有噪声的那条

`pnpm perf:bundle`（`scripts/perf-bundle.mjs`）——构建三端，逐个 dist 目录算 gzip 字节，按
target × 类型汇总，再列出剥掉 content hash 后最大的几个 chunk，和 `perf/bundle-baseline.json` 比差值。
口径上它和 Lighthouse 同属实验室，但它补的正是那张对比表里实验室唯一的短板：**实验室拿不到真实用户
的分布，但拿得到精确的字节数**——同一份 dist 连跑两次字节级完全相同（已在 `bundle-history.jsonl` 里验证），
所以 Lighthouse 那条要等 3 轮取中位数、这一条不需要。

|                  | Lighthouse                  | 产物体积                         |
| ---------------- | --------------------------- | -------------------------------- |
| 问的是           | 这台机器今天跑出多少毫秒    | 这次改动往用户手机多塞了多少字节 |
| 噪声             | 有，同产物 LCP 实测差 741ms | **零**，可比到字节               |
| 一次             | 三端 7 页 × 3 轮实测 4m22s  | 构建约 1 分钟，`--no-build` 秒级 |
| 现在能不能设门禁 | 不能（先攒一个月基线）      | **能**，要设就先设这条           |

`web` 拆成 `client` / `server` 两行：client 决定 LCP，server 决定 TTFB，混在一起量时一次只改服务端代码的
提交会显示成「包涨了」。

它的盲区要说清，否则会被当成「已经知道该拆谁」：**最大的几个 chunk 叫 `src.js` / `link.js`**
（Rolldown `autoCodeSplitting` 按目录与首个符号命名，名字不携带内容信息）。所以**这一份**测量答得了
「变大了没有、涨了哪一类、首屏多重」，答不了「该拆谁」——后者由 `pnpm perf:attrib` 接住（手工解 hidden
sourcemap 做模块级归属，同一口径、同样只记录），用法与两条读法坑在 perf/README。

它同样是**只记录、不阻断**。

- **传输** ✅ `sendBeacon` / `fetch(keepalive)`，body 用 `text/plain` 避开 CORS 预检；`visibilitychange → hidden` 时 flush，**不依赖 `unload`**（移动端基本不触发）——`transport.ts`
- **最早的错误** 🟡 全局监听在应用装配时挂（三端都早于首屏渲染），但**没有做 `<head>` 内联那一小段**：本仓脚本都是同源静态产物，没有跨域 CDN，`Script error.` 那个失败模式当前不成立；真接 CDN 时要补
- **不拖垮页面** ✅ 出口自身全部 try/catch、空闲时（`requestIdleCallback`）处理；🟡 采样率与总开关的**远程下发**未做（当前由 `configureMonitoring` 静态传入，接收端上线后补下发通道）
- **采样** ✅ 错误近乎全量，同一会话同一错误限次 3 条（`captureError` 内的指纹计数）；性能按 session hash 抽样
- **现场** ✅ 内存常驻最近 30 条面包屑（当前接了路由切换；点击/请求面包屑待接），随错误一起报
- **聚合** 🟡 发送侧已算好归一化指纹（`fingerprint`：归一化 message + 栈顶三帧，抹掉行号与数字/UUID）；**接收端按影响用户数排序、sourcemap 还原**要等接收端
- **告警** ⏸ 设最小样本量（凌晨 2 次请求挂 1 次，不该按 50% 错误率叫人）；新指纹单独告警，发布窗口内提级——与采集栈同批（observability.md 延后项第 1 行）

## 延后项（带触发条件）

终态参考（淘宝级。阿里内部是 Retcode，对外产品化为 ARMS 前端监控；另有 aplus 埋点与鹰眼链路）：

```
端 SDK → 独立日志域名 + 无状态接收层 → 消息队列
       → 流计算（清洗、sourcemap 还原、指纹、分钟级预聚合）
       → 分层存储（时序库存聚合 / 明细库存 7~30 天 / 数仓离线）
       → 大盘 · 告警 · 排查 · 发布卡口
```

下表是这条链路上的组件，按触发条件逐个长出来，没到条件不预搭：

| 组件 / 功能                               | 触发条件                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| 消息队列                                  | 接收层直写存储开始丢数据，或实时告警与离线分析要同时消费                     |
| 流式预聚合                                | 直接查明细算告警，1 分钟内算不完                                             |
| 动态基线告警（同比 / 环比）               | 固定阈值误报多到没人看                                                       |
| 漏斗转化监控（详情 → 加购 → 下单 → 支付） | 上线后日流量稳定、能做同比基线。它抓的是零报错的失效，比如按钮被透明浮层盖住 |
| 会话回放（rrweb，只传出错前几十秒）       | 反复出现「有报错、有面包屑，还是复现不了」                                   |
| 拨测（无头浏览器定时跑核心链路）          | 出现过「凌晨出故障、早上才发现」                                             |
| 灰度卡口与自动回滚                        | 发布频繁到人工盯不过来                                                       |
