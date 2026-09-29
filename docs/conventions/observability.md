# 可观测性总纲

- **状态**：方案沉淀；「现状对照」一节为 2026-09-27 按代码核对的结果。首批 1、2、3 已落地并于同日在本地服务上实测；前端实验室性能测量 2026-09-29 落地、RUM 发送侧 2026-09-30 落地（均见 frontend-monitoring.md）；其余未实现
- **日期**：2026-09-27

本文管全局：分层、关联键、指标、对账、告警，以及现状差距。两份细则不在这里重复——后端业务事件见 [business-event-logging.md](business-event-logging.md)，前端上报见 [frontend-monitoring.md](frontend-monitoring.md)。

目标与前端文档一致，对标阿里的 **1-5-10**（1 分钟发现、5 分钟定位、10 分钟恢复）。判据也沿用那边的：**晚半年再做，会不会丢掉补不回来的数据，或者要改所有调用方？** 会，就进「契约」；不会，就进「首批」或「延后项」。

## 终态参考（淘宝级，不照搭）

```
业务层    GMV / 下单成功率 / 支付成功率（分钟级同环比）· 实时对账（订单↔支付↔库存↔券）
应用层    Trace（鹰眼）· Metrics（秒级预聚合）· 结构化日志（SLS）· 持续 Profiling · 变更事件
中间件    RPC / MQ / DB / 缓存客户端自带埋点，traceId 自动透传，业务代码零埋点
端侧      RUM（见 frontend-monitoring.md）
          ↓ 统一标签（app / env / version / 机房）+ traceId 关联
告警      SLO 与错误预算 · 按依赖拓扑收敛只报根因 · 发布窗口提级 → 预案（限流 / 降级 / 切流）
```

淘宝级做法里，真正能搬过来的是**思路**，不是组件：

- **traceId 由基础设施透传**：业务代码不手传。难点在线程池、异步、MQ 这些边界（阿里为此开源了 TransmittableThreadLocal）
- **头部采样控成本，尾部采样保现场**：错误和慢请求 100% 留存
- **标签基数是硬约束**：用户、订单这类 ID 进日志字段，不进指标标签
- **对账是电商独有的一层**：技术指标全绿、钱或库存却对不上的故障，只有对账能发现
- **压测标、灰度标走同一套上下文透传**：全链路压测时，数据落影子表
- **大部分故障来自变更**：发布、配置、开关都要作为事件打到时间轴上

**平台不自研**：鹰眼、ARMS 这类界面，是 PB 级数据量加上几百个内部系统打通的副产品，本仓两个条件都不具备。查询、看板、告警用 Grafana（指标、日志、链路）；前端错误用 Sentry 或 GlitchTip（见前端文档的选型）。admin 里只做监控工具做不好、且运营也要用的**业务页**，触发条件见延后项。

## 契约

1. **关联键**：`trace_id` 就是 `x-request-id`（32 位 hex，与 W3C trace-id 同形，接 OpenTelemetry 时直接复用，GEN-35/36）
    - 入口有两处：HTTP 请求走 `RequestIdFilter`；定时任务走 `MdcTaskDecorator`，没有上游时自己生成一个作为链路起点
    - 当前所有跨模块监听器都是同步 `@EventListener`，同线程天然带着上下文。**新增任何异步边界**（`@Async`、自建线程池、`CompletableFuture`、MQ）时，必须经 `TaskDecorator` 或消息头透传，和边界同一个提交落地
2. **信封**：`service.name` / `version` / `env` 前后端同名（GEN-48）。`version` 必须能定位到一次构建（git sha），`env` 必须是真实环境——带错信封的历史日志事后改不回来
3. **指标标签只许有界枚举**：可以用 `event`、`status`、`method`、`uri`（路由模板）、`job`、`reason`；`user_id`、`order_id`、手机号、原始 URL 永远不进标签，要看这些去日志里按字段查
4. **单一出口**：业务事件只经 `BizEvent`。业务计数也挂在这个出口上：`BizEvent` 每打一行，同时累加 `shop_biz_events_total{event, level}`，业务代码不散落 `MeterRegistry`。事件名受目录门禁约束，基数天然有界
5. **出站调用**：`RestClient` / `WebClient` 从 Spring 注入的 `Builder` 构建，这样自带 `http.client.requests` 指标，将来也能自带 trace 头传播。失败要进事件目录（business-event-logging.md 新增事件规则第 1 条）

## 现状对照（2026-09-27）

| 项                 | 现状                                                                                                                                                                                                                                       | 差距                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 结构化日志         | 文件输出 ECS JSON，每行带 `trace_id` / `version` / `env`；`http.request` 覆盖每个请求                                                                                                                                                      | 还没进集中检索                                                                                     |
| 业务事件           | `BizEvent` 与目录门禁都已就位                                                                                                                                                                                                              | 只存在于日志里，没有对应的计数指标                                                                 |
| 信封 `env`         | ~~prod 没覆盖，落到 `RequestIdFilter` 默认值 `dev`~~ → `application-prod.yml` 写死 `prod`（首批 1）                                                                                                                                        | 已修                                                                                               |
| 信封 `version`     | ~~写死 `0.0.1-SNAPSHOT`~~ → 读 `SHOP_VERSION`，prod 无默认值、漏配即启动失败（首批 1）                                                                                                                                                     | 发布流程还要真的注入 git sha                                                                       |
| HTTP 指标          | Actuator 已暴露 `/actuator/prometheus`，`http.server.requests` 自动采集并已开 `percentiles-histogram`（首批 2），实测输出 `http_server_requests_seconds_bucket`                                                                            | 已修                                                                                               |
| 链路               | 进程内靠 MDC 串联；单体下够用                                                                                                                                                                                                              | 没有 `micrometer-tracing`（事件文档原写「已就绪」，不符，已订正）                                  |
| 定时任务           | 7 个 `@Scheduled` 共用 4 线程池，`Sweep` 逐笔隔离；单笔失败除 `[SWEEP]` error 日志外计 `shop.sweep.failures{job}`；停摆由 Spring 自带的 `tasks.scheduled.execution` 覆盖，实测在自定义 `SchedulingConfig` 下照常输出（首批 3）             | 告警规则待采集栈上线后配                                                                           |
| 出站 HTTP          | 快递鸟 `KdniaoConfig` 用静态 `RestClient.builder()` 自建客户端                                                                                                                                                                             | 没有指标，失败不进事件，违反契约第 5 条                                                            |
| 对账               | `pnpm health:scan`：4 项只读 SQL，手动跑                                                                                                                                                                                                   | 没有定时、没有告警；缺订单↔支付、库存冻结↔待付款单                                                 |
| 采集与告警栈       | 无                                                                                                                                                                                                                                         | 上线前置要求（production-readiness「监控」）                                                       |
| 前端性能（实验室） | `pnpm perf`：生产构建 + preview 上跑 Lighthouse，逐页多轮取中位数，与 `perf/baseline.json` 比差值；`pnpm perf:bundle`：三端 dist 的 gzip 字节与 `perf/bundle-baseline.json` 比差值，**零噪声**（2026-09-29 落地）。两条都只记录不阻断      | 没进 CI（缺「生产构建 + preview」那一步，e2e job 现在起的是 dev server）；要设门禁先设体积这条     |
| 前端 RUM（发送侧） | 单一出口 `captureError`/`track`（`packages/common/src/monitoring`）+ 事件信封 + `sendBeacon` 传输 + 全局监听/PV/接口事件/Web Vitals/白屏/hydration + sourcemap hidden；三端 `defaultOnCatch` 已接，`createMeQuery` 填 userId（2026-09-30） | **接收端未上线**，`configureMonitoring` 默认 `enabled:false`；SSR 服务端渲染错误待接收端落地时再做 |

## 首批（按收益排序）

1. ✅ **修信封**：prod 的 `env` 写死 `prod`；`version` 读 `SHOP_VERSION`，由发布流程注入 git sha（没选 git-commit-id 插件：环境变量零依赖，和 prod 其余变量同一个「漏配即启动失败」口径）
2. ✅ **p95**：`management.metrics.distribution.percentiles-histogram.http.server.requests: true`，由 Prometheus 侧算分位
3. ✅ **作业可见性**，分两种故障模式：
    - **停摆**（作业不跑或卡死）：用 Spring 自带的 `tasks.scheduled.execution` 观测，零代码，按 `code_namespace` / `code_function` 区分作业。告警规则按 `increase(tasks_scheduled_execution_seconds_count{outcome="SUCCESS"}[N 个周期]) == 0` 配；卡在执行中的作业另看 `tasks_scheduled_execution_active_seconds_max`。一个作业跑完第一轮之前没有 `_count` 序列，规则要用 `absent()` 兜住。停摆才是这类作业最危险的故障模式——超时关单不跑，库存就一直冻着
    - **单笔失败**：`Sweep` 吞掉单笔异常，作业整体仍算 SUCCESS，上面那个指标看不见，所以另计 `shop.sweep.failures{job}`（首次失败时才注册，平时 Prometheus 里没有这条序列属正常）。原方案是改走 `BizEvent`，但 `infra` 已依赖 `common`，反向依赖会成模块环，因此改用 Micrometer 全局注册表（和 slf4j 一样是门面库，`common` 依赖它不破「框架无关」）
4. **业务计数**：实现契约第 4 条。下单量、退款失败、登录失败这些速率就都能画图、能告警了
5. **快递鸟出站**：改用注入的 `RestClient.Builder` 并补失败事件
6. **对账作业**：把 `health:scan` 的检查搬进应用内的定时作业，发现差异就打事件（`reconcile.mismatch`，带 `check` 与计数）；补两项检查：已付款订单必有成功流水、成功流水必有订单；冻结库存与待付款单一致

## 延后项（带触发条件）

| 组件 / 功能                                                    | 触发条件                                                |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| Prometheus + Alertmanager + Grafana，日志进 Loki（或云 SLS）   | 首次生产部署前（production-readiness 要求，不再往后推） |
| admin「对账差异」页：列出、标记处理、重新核对                  | 对账作业上线，并且出现了需要人工处理的差异              |
| admin「按订单号查链路」：订单 → 相关 `trace_id` → 跳转 Grafana | 集中日志上线后                                          |
| OpenTelemetry Java Agent + Tempo（分布式链路、尾部采样）       | 出现第二个服务进程或引入 MQ；在那之前进程内 MDC 已足够  |
| DB 查询指标                                                    | 见 business-event-logging.md 延后项                     |
| 持续 Profiling（Pyroscope / async-profiler）                   | 出现一次只能靠现场 jstack 才定位到的 CPU 或锁问题       |
| 业务大盘同环比、动态基线告警                                   | 日流量稳定到能形成基线，且固定阈值误报多到没人看        |
| SLO 与错误预算告警                                             | 核心接口有了一个月以上的 p95 与错误率基线               |
| 发布、配置变更作为事件标注在看板上                             | 发布频繁到「最近改了什么」要翻聊天记录才答得上          |
| 全链路压测（压测标经上下文透传，数据落影子表）                 | 大促或容量规划前                                        |
