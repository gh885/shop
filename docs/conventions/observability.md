# 可观测性总纲

- **状态**：方案沉淀；「现状对照」一节为 2026-09-27 按代码核对的结果，2026-09-30 起 4（业务事件计数）、5（快递鸟出站）、6（应用内对账作业）已落地；采集栈已在本机以最小形态上线（`pnpm obs up`，见 [deploy/observability/README.md](../../deploy/observability/README.md)），告警规则随之加载、看板就位；生产形态 2026-10-12 落地：Grafana Cloud 托管 + 主机 Alloy（见「生产形态」一节与 [ADR 0005](../adr/0005-observability-hosting.md)），本机联调全链路验证，规则暂停到主机上线。前端实验室性能测量、RUM 发送侧见 frontend-monitoring.md。
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

| 项                     | 现状                                                                                                                                                                                                            | 差距                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 结构化日志             | 文件输出 ECS JSON，每行带 `trace_id` / `version` / `env`；`http.request` 覆盖每个请求                                                                                                                           | 已进 Grafana Cloud Loki（Alloy 读文件推送，本机联调验证）；生产待主机上线                 |
| 业务事件               | `BizEvent` 与目录门禁都已就位；每打一行同时累加 `shop_biz_events_total{event, level}`（首批 4）                                                                                                                 | 已修                                                                                      |
| 信封 `env`             | ~~prod 没覆盖，落到 `RequestIdFilter` 默认值 `dev`~~ → `application-prod.yml` 写死 `prod`（首批 1）                                                                                                             | 已修                                                                                      |
| 信封 `version`         | ~~写死 `0.0.1-SNAPSHOT`~~ → 读 `SHOP_VERSION`，prod 无默认值、漏配即启动失败（首批 1）                                                                                                                          | 发布流程还要真的注入 git sha                                                              |
| HTTP 指标              | Actuator 已暴露 `/actuator/prometheus`，`http.server.requests` 自动采集并已开 `percentiles-histogram`（首批 2），实测输出 `http_server_requests_seconds_bucket`                                                 | 已修                                                                                      |
| 链路                   | 进程内靠 MDC 串联；单体下够用                                                                                                                                                                                   | 没有 `micrometer-tracing`（事件文档原写「已就绪」，不符，已订正）                         |
| 定时任务               | 7 个 `@Scheduled` 共用 4 线程池，`Sweep` 逐笔隔离；单笔失败计 `shop.sweep.failures{job}`；停摆由 Spring 自带 `tasks.scheduled.execution` 覆盖；`MdcTaskDecorator` 为无父上下文任务补 `trace_id`/`version`/`env` | 告警规则待采集栈上线后配                                                                  |
| 出站 HTTP              | 快递鸟从 Boot 注入的 `RestClient.Builder` 构建，自动带 `http.client.requests`；网络/空响应/解析/渠道拒绝失败都进 `logistics.tracking_query.failed`（首批 5）                                                    | 已修                                                                                      |
| 对账                   | `pnpm health:scan`：8 项只读 SQL；应用内 `ReconcileJob` 每天定时跑同口径检查并打 `reconcile.mismatch`（首批 6）                                                                                                 | 告警规则文件已入仓，采集栈上线后加载                                                      |
| 采集与告警栈           | Windows 本机栈由 `pnpm obs up` 管理；五块 Grafana 看板通过 provisioning 加载，详见 [接入清单](../../deploy/observability/README.md)                                                                             | 生产形态已定为 Grafana Cloud（见下）；本机栈保留为开发期工具                              |
| 前端性能（实验室）     | `pnpm perf`：LHCI 七页 × 三轮，逐轮校验真实内容；`pnpm perf:bundle`：Size Limit；`pnpm perf:attrib`：Visualizer                                                                                                 | 体积与页面有效性进 CI；LHCI 耗时阈值当前为 warn，不替代线上用户分布                       |
| 前端 RUM               | 三端 web-vitals 采集首次后台快照，经 `/api/rum/events` 校验、Redis 去重，导出 LCP/INP 时间桶与 CLS 桶；看板 `shop-web-vitals` 显示 p75/样本量/拒收原因                                                          | 已实现并验证；需前后端同批发布、Prometheus 抓取后才有线上数据；SSR 错误还原与性能告警未接 |
| 生产形态（2026-10-12） | Grafana Cloud 免费档承接指标 / 日志 / 告警 / 看板，主机只跑 Alloy；`pnpm obs:cloud:sync` 幂等同步 5 看板 + 10 规则 + 邮件通知；本机联调验证故障 → 告警 4 分钟 → 邮件 → 恢复 → RESOLVED                          | 规则 paused 到主机上线；Alloy 待进主机编排                                                |

## 首批（按收益排序）

1. ✅ **修信封**：prod 的 `env` 写死 `prod`；`version` 读 `SHOP_VERSION`，由发布流程注入 git sha（没选 git-commit-id 插件：环境变量零依赖，和 prod 其余变量同一个「漏配即启动失败」口径）
2. ✅ **p95**：`management.metrics.distribution.percentiles-histogram.http.server.requests: true`，由 Prometheus 侧算分位
3. ✅ **作业可见性**，分两种故障模式：
    - **停摆**（作业不跑或卡死）：用 Spring 自带的 `tasks.scheduled.execution` 观测，零代码，按 `code_namespace` / `code_function` 区分作业。告警规则按 `increase(tasks_scheduled_execution_seconds_count{outcome="SUCCESS"}[N 个周期]) == 0` 配；卡在执行中的作业另看 `tasks_scheduled_execution_active_seconds_max`。一个作业跑完第一轮之前没有 `_count` 序列，由独立规则 `ShopScheduledJobMetricAbsent` 用 `absent()` 兜住——别和 `increase(...) == 0` 用 `or` 并进一条：两支同时为真时标签集异构，Grafana-managed 的表达式链会评估报错（2026-10-12 实测，见 ADR 0005）。停摆才是这类作业最危险的故障模式——超时关单不跑，库存就一直冻着
    - **单笔失败**：`Sweep` 吞掉单笔异常，作业整体仍算 SUCCESS，上面那个指标看不见，所以另计 `shop.sweep.failures{job}`（首次失败时才注册，平时 Prometheus 里没有这条序列属正常）。原方案是改走 `BizEvent`，但 `infra` 已依赖 `common`，反向依赖会成模块环，因此改用 Micrometer 全局注册表（和 slf4j 一样是门面库，`common` 依赖它不破「框架无关」）
4. ✅ **业务计数**：实现契约第 4 条。`BizEvent` 每行同时累加 `shop_biz_events_total{event, level}`，下单量、退款失败、登录失败等速率可画图、可告警
5. ✅ **快递鸟出站**：改用注入的 `RestClient.Builder` 并补 `logistics.tracking_query.failed` 失败事件
6. ✅ **对账作业**：`ReconcileJob` 每天跑 8 项只读检查，发现差异打 `reconcile.mismatch{check,count}`；订单↔支付、成功流水↔订单、金额一致与冻结↔待付款单已覆盖。生产告警规则待采集栈落地

## 生产形态：Grafana Cloud + Alloy（2026-10-12）

主机（阿里云 2C / 1.6G）塞不下自建 Prometheus 全家桶，采集栈走托管；为什么是 Grafana Cloud、备选是什么，见 [ADR 0005](../adr/0005-observability-hosting.md)；接入步骤与命令见 [deploy/observability/README.md](../../deploy/observability/README.md)。

- **分工**：主机只跑一个 Grafana Alloy（`deploy/observability/alloy/config.alloy`）——抓 `/actuator/prometheus` 远程写到云端 Prometheus，读 `SHOP_LOG_FILE` 的 ECS JSON 推云端 Loki。应用零改动；配置本身不含任何值，端点与凭据全走环境变量。
- **资产同步**：5 块看板、10 条告警（Grafana-managed）、邮件 contact point 与根路由，全部由 `pnpm obs:cloud:sync` 从仓库幂等推上去。云端是只读副本：改仓库、重跑脚本。
- **规则暂停约定**：主机上线前规则保持 paused（`--pause`）——本机采集不跑时 `absent()` 类规则会按设计空叫。上线当天不带 `--pause` 重跑即启用。
- **告警语义**：Prometheus 规则经 Grafana 的 convert API 导入，会补 `prometheus_math` + `threshold` 表达式：查无数据 = Normal（不是 NoData）。代价是**一条规则里不能混异构标签集**，`or absent()` 已拆成独立规则。
- **通知边界**：Grafana Cloud 只给 org 成员的邮箱发告警，收件箱在 `.env.local` 的 `GRAFANA_CLOUD_ALERT_EMAIL`。
- **已验证**（本机联调）：指标与日志到云端；按 `trace_id` 捞回一次请求的全部行；停后端 → `ShopServerTargetDown` 4 分钟 Firing → 邮件；恢复 → RESOLVED 邮件；`ShopScheduledJobMetricAbsent` 全程未误响。

## 延后项（带触发条件）

| 组件 / 功能                                                                                                                                                                         | 触发条件                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ~~Prometheus + Alertmanager + Grafana，日志进 Loki（或云 SLS）~~ 已定：Grafana Cloud 托管 + 主机 Alloy（[ADR 0005](../adr/0005-observability-hosting.md)），2026-10-12 本机联调验证 | 主机上线当天：Alloy 进编排、`pnpm obs:cloud:sync` 不带 `--pause` 启用规则 |
| admin「对账差异」页：列出、标记处理、重新核对                                                                                                                                       | 对账作业上线，并且出现了需要人工处理的差异                                |
| admin「按订单号查链路」：订单 → 相关 `trace_id` → 跳转 Grafana                                                                                                                      | 集中日志上线后                                                            |
| OpenTelemetry Java Agent + Tempo（分布式链路、尾部采样）                                                                                                                            | 出现第二个服务进程或引入 MQ；在那之前进程内 MDC 已足够                    |
| DB 查询指标                                                                                                                                                                         | 见 business-event-logging.md 延后项                                       |
| 持续 Profiling（Pyroscope / async-profiler）                                                                                                                                        | 出现一次只能靠现场 jstack 才定位到的 CPU 或锁问题                         |
| 业务大盘同环比、动态基线告警                                                                                                                                                        | 日流量稳定到能形成基线，且固定阈值误报多到没人看                          |
| SLO 与错误预算告警                                                                                                                                                                  | 核心接口有了一个月以上的 p95 与错误率基线                                 |
| 发布、配置变更作为事件标注在看板上                                                                                                                                                  | 发布频繁到「最近改了什么」要翻聊天记录才答得上                            |
| 全链路压测（压测标经上下文透传，数据落影子表）                                                                                                                                      | 大促或容量规划前                                                          |
