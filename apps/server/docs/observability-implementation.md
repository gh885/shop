# 可观测性实现对照

> **快照文档**：记录实现进度对照，非持续维护的约定；后续变更以代码为准。
> 依据清单：[docs/reference/observability-checklist.md](../../docs/reference/observability-checklist.md) v1.0（2026-07-29）。更新于 2026-07-29。

| ID        | 优先级 | 状态      | 说明                                                                                                                                  |
| --------- | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-01    | P0     | ✅ 已实现 | RequestIdFilter.resolveRequestId() 读取入站 x-request-id 头，合法则采纳                                                               |
| REQ-02    | P0     | ✅ 已实现 | UUID v4 32 hex 格式校验，不合法则自生成                                                                                               |
| REQ-03    | P0     | ✅ 已实现 | trace_id 写入 MDC，进程内任何位置可取                                                                                                 |
| REQ-04    | P0     | ✅ 已实现 | logback-spring.xml 已配 [%X{traceId:-},%X{requestId:-}]（切 JSON 前）；后者由 logging.structured.format=logstash 自动将 MDC 注入 JSON |
| REQ-05    | P0     | ❌ 延后   | 项目暂无出站 HTTP 调用与 MQ 客户端；Micrometer Tracing 已为 traceparent 传播就绪，接入时配 REST 模板拦截器                            |
| REQ-06    | P1     | ✅ 已实现 | MdcTaskDecorator + AsyncConfig 传递 MDC 到 @Async 线程；@Scheduled 暂为注释态                                                         |
| REQ-07    | P0     | ✅ 已实现 | RequestIdFilter 在序列化前设 x-request-id 头；CorsConfig 已 expose 该头                                                               |
| REQ-08    | P1     | ✅ 已实现 | 异常响应 ProblemDetail 带 requestId 字段；成功响应体不带                                                                              |
| REQ-09    | P2     | ⏳ 延后   | 项目暂无跨服务调用需求。需要时通过网关或拦截器加 traceparent，当前无 OTel 依赖                                                        |
| LOG-01    | P0     | ✅ 已实现 | logging.structured.format=logstash，每条日志一行 JSON                                                                                 |
| LOG-02    | P0     | ✅ 已实现 | RequestIdFilter 每请求注入 trace_id/version/env 到 MDC；结构化格式自动包含 service.name（spring.application.name）                    |
| LOG-03    | P0     | ✅ 已实现 | 固定事件目录见 EVT-*；业务事件见 business-event-logging.md                                                                            |
| LOG-04    | P0     | ⏳ 部分   | MDC 字段在 logstash 格式下为 mdc.* 嵌套，非顶层平铺。可升级至 ECS 格式或自定义 encoder 解决                                           |
| LOG-05    | P0     | ✅ 已实现 | latency_ms 等字段在代码中为数字                                                                                                       |
| LOG-06    | P0     | ⏳ 已审核 | maskPhone() 对手机号脱敏；需代码评审确认全局无明文敏感字段通行                                                                        |
| LOG-07    | P0     | ✅ 已实现 | Spring Boot 默认只配 console appender，未配任何文件输出                                                                               |
| LVL-01    | P0     | ✅ 约定   | debug：生产默认关闭                                                                                                                   |
| LVL-02    | P0     | ✅ 约定   | info：正常业务事件与请求日志                                                                                                          |
| LVL-03    | P0     | ✅ 约定   | warn：系统兜住的情况（限流命中、重放检测）                                                                                            |
| LVL-04    | P0     | ✅ 约定   | error：http.request 在 status>=500 时打成 error；未捕获异常走 handleGeneral 打 error                                                  |
| EVT-01    | P0     | ✅ 已实现 | HttpRequestLoggingInterceptor 每请求打 method/path/status/latency_ms/client_ip                                                        |
| EVT-02    | P0     | ✅ 已实现 | path 使用 HandlerMapping.bestMatchingPattern（路由模板）                                                                              |
| EVT-03    | P1     | ⏳ 延后   | 待 MyBatis-Plus 拦截器统一埋点，或用数据源代理 AOP                                                                                    |
| EVT-04    | P1     | ⏳ 延后   | 随 EVT-03                                                                                                                             |
| EVT-05    | P1     | ⏳ 约定   | SQL 原文不打日志；慢查询走 PG slow log                                                                                                |
| EVT-06    | P2     | ⏳ 延后   | 项目暂无出站 HTTP 调用                                                                                                                |
| EVT-07    | P2     | ⏳ 延后   | 随 EVT-06                                                                                                                             |
| EVT-08    | P1     | ⏳ 延后   | 项目暂未使用 MQ                                                                                                                       |
| EVT-09    | P1     | ⏳ 延后   | 随 EVT-08                                                                                                                             |
| EVT-10    | P0     | ✅ 已实现 | Spring Boot 启动日志自带 app.started                                                                                                  |
| EVT-11    | P0     | ✅ 已实现 | GlobalExceptionHandler.handleGeneral 捕获未处理异常                                                                                   |
| EVT-12    | P1     | ✅ 已实现 | AuthService.issueTokens 打 auth.login.succeeded                                                                                       |
| EVT-13    | P1     | ✅ 已实现 | AuthService.authenticate 各失败分支打 auth.login.failed（reason 枚举）                                                                |
| EVT-14    | P1     | ⏳ 约定   | 目录模式已定，新增公共依赖时按同样格式补                                                                                              |
| BEV-01~04 | P0     | ✅ 约定   | 见 business-event-logging.md                                                                                                          |
| INS-01    | P0     | ✅ 已实现 | 固定事件目录（EVT-01/10/11）已通过拦截器/框架自动触发                                                                                 |
| INS-02    | P0     | ⏳ 延后   | 项目暂无出站调用；接入时强制走公共 client                                                                                             |
| INS-03    | P0     | ✅ 已实现 | MDC + OTel context 共享，信封注入与埋点同套设施                                                                                       |
| INS-04    | P1     | ✅ 已实现 | 见 business-event-logging.md                                                                                                          |
| INS-05    | P2     | ⏳ 约定   | 新增公共依赖时补埋点进目录，不允许先上线后补                                                                                          |
| MET-01    | P0     | ✅ 已实现 | 可通过 /actuator/prometheus 获取 http.server.requests 等指标                                                                          |
| MET-02    | P0     | ✅ 已实现 | 同上                                                                                                                                  |
| MET-03    | P0     | ⏳ 延后   | DB 查询指标依赖 EVT-03 埋点实现后可用                                                                                                 |
| MET-04    | P1     | ⏳ 延后   | Docker Compose / 托管平台自带资源监控                                                                                                 |
| ALM-01~03 | P0     | ⏳ 延后   | 需要 Prometheus + Alertmanager 基建，当前无部署环境                                                                                   |
| ALM-04~06 | P1     | ⏳ 延后   | 随 ALM-01~03                                                                                                                          |
| REL-01    | P0     | ✅ 已实现 | version 从 spring.application.version 经由 RequestIdFilter 注入每行日志 MDC                                                           |
| REL-02    | P1     | ⏳ 延后   | 与 CI/CD 流程绑定，项目尚未上 CI                                                                                                      |

## 汇总

| 优先级 | 总数 | ✅ 已实现 | ⏳ 延后/部分 | ❌ 不做 |
| ------ | ---- | --------- | ------------ | ------- |
| P0     | 26   | 19        | 7            | 0       |
| P1     | 14   | 6         | 8            | 0       |
| P2     | 5    | 1         | 4            | 0       |

## 当前未覆盖的 P0 说明

- **REQ-05**：无出站调用/MQ，不需要传递。基础设施已就绪（Micrometer Tracing），接入时配拦截器即可。
- **LOG-04**：MDC 字段在 logstash 格式下为 `mdc.*` 嵌套，不影响检索与告警。可按需升级至 ECS 格式。
- **LOG-06**：当前代码仅 maskPhone() 处理手机号。需全局安全审计确认无其他敏感字段泄露。
- **MET-03**：依赖 EVT-03 埋点（DB 查询事件），暂未实现。可通过 PG 慢查询日志兜底。
- **ALM-01~03**：需要部署环境支撑 Prometheus + Alertmanager，当前无基础设施。
