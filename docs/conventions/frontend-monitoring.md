# 前端监控约定

- **状态**：方案沉淀，未实现。web 有 `reportError`（router `defaultOnCatch`），生产仍只打 console；seller / admin 只有错误页，没有上报出口
- **日期**：2026-09-27

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
    - web 的 `reportError`（`apps/web/src/shared/lib/report-error.ts`）；seller / admin 补上同样的 `defaultOnCatch`
    - 契约漂移的 `console.error` 锚点（`packages/common/src/sdk-client.ts`，GEN-28）
    - [i18n.md](i18n.md) 约定的缺 key 上报
    - FUT-02 的曝光 / 点击上报落地时复用同一传输与信封，不另起一套
4. **版本与 sourcemap**：`version` 构建时注入（建议 git sha）。sourcemap 用 Vite `build.sourcemap: "hidden"` 生成（产物里不留 `sourceMappingURL`），按 `version` 归档，不随静态资源发布
5. **隐私边界**：不采输入框内容、密码、token；URL 的 query 与 hash 不采（可能带 token 或个人信息）；手机号只以 `maskPhone` 形态出现（GEN-51）；会话回放如果引入，默认遮罩全部输入与文本

## 首批功能

「按需」的「需」按业务判断，电商里以下几项第一天就算需：

- **PV**：每次路由切换报一条。它是错误率、白屏率的分母，也是将来漏斗监控的底数
- **JS 异常**：捕获阶段监听 `error`（连带资源加载失败）、`unhandledrejection`、路由错误边界。跨域脚本要加 `<script crossorigin>`，CDN 还得回 `Access-Control-Allow-Origin`，否则只拿到 `Script error.`
- **页面级失效**：seller / admin 是 SPA，做白屏检测——加载后在水平、垂直中线上各取 9 个点调 `elementFromPoint`，全落在 html / body / 根容器上就判白屏。web 是 SSR，首屏有 HTML，要盯的是 hydration 失败（看着正常、点不动）；SSR 服务端的渲染错误不经过浏览器，要在服务端单独捕获进日志
- **接口**：失败全报，成功按采样报（带耗时）。本仓错误走 ProblemDetail + 真实状态码（GEN-18），没有「200 包业务失败」；计为失败的是 5xx、网络层失败（`status: 0`）和 `RESPONSE_VALIDATION_FAILED`（2xx 但契约漂移，GEN-28）。4xx 多是业务拒绝，单列看趋势（突增往往是前端传参出了 bug）；401 刷新后重放成功的不计
- **Web Vitals**（仅 web）：LCP / INP / CLS 看 p75。买家端性能直接影响转化，基线要从上线第一天攒

接收端选型是可逆决定（有单一出口兜着），实现时再定：

- **Sentry / GlitchTip**：错误聚合、sourcemap 还原、版本追踪、告警都是现成的；GlitchTip 比 Sentry 自建轻得多
- **后端加接收接口**：前端事件打成 ECS JSON，和后端事件进同一个检索、按 `trace_id` 直接关联；顺手计 Micrometer 指标，告警与后端共用 Prometheus + Alertmanager（business-event-logging.md 的延后项）。sourcemap 还原和指纹聚合要自己做

## 实现要点

- **传输**：`sendBeacon` / `fetch(keepalive)`，body 用 `text/plain` 避开 CORS 预检；`visibilitychange → hidden` 时 flush，不依赖 `unload`（移动端基本不触发）
- **最早的错误**：`<head>` 内联一小段先挂监听、缓存事件，完整逻辑再异步加载
- **不拖垮页面**：出口自身全部 try/catch、空闲时处理；采样率与总开关远程下发
- **采样**：错误近乎全量，但同一会话同一错误限次；性能按用户 hash 抽样
- **现场**：内存常驻最近几十条面包屑（点击、路由切换、请求），随错误一起报
- **聚合**：sourcemap 还原后按「归一化 message + 栈顶几帧」算指纹，按影响用户数排序，不按次数
- **告警**：设最小样本量（凌晨 2 次请求挂 1 次，不该按 50% 错误率叫人）；新指纹单独告警，发布窗口内提级

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
