# 可观测性接入清单

当前应用侧已具备：

- `/actuator/prometheus`：Spring Boot + Micrometer 指标出口，所有指标带 `application` / `env` / `version` 标签。
- ECS JSON 日志：每行带 `trace_id` / `version` / `env` / `event`，业务事件由 `BizEvent` 统一出口。
- 业务计数：`shop_biz_events_total{event,level}`。
- 对账：`ReconcileJob` 定时检查，差异打 `reconcile.mismatch`。
- 健康探针：`/actuator/health/liveness`、`/actuator/health/readiness`。

## 最小自建栈

推荐顺序，不要一开始上全家桶：

1. **Prometheus** 抓 `/actuator/prometheus`，加载 `prometheus/shop-alerts.yml`。
2. **Loki + Promtail/Alloy** 收 `SHOP_LOG_FILE` 的 ECS JSON 日志，至少保留 `env` / `version` / `trace_id` / `event` / `level` 字段。
3. **Grafana** 接 Prometheus 与 Loki 数据源，按 `env` / `version` / `application` 过滤。
4. **Alertmanager** 接 Prometheus 告警，做分组、静默和通知。

资源受限时，优先考虑 Grafana Cloud 或其他托管 Prometheus/Loki/日志服务；本地只留应用和采集器。

## 抓取与访问

- Prometheus 在**内网**抓取 `/actuator/prometheus`，不要把该端点直接暴露公网。
- 日志采集只读取日志文件，不通过网络暴露后端日志文件。
- Grafana 走 HTTPS、登录/SSO；Prometheus/Loki/Alertmanager 只允许内网或本机。
- 指标标签使用有界枚举：`event`、`status`、`method`、`uri`、`job`、`reason`；用户/订单/手机号不进指标标签。

## 排查路径

1. 告警看 `event` / `uri` / `status` / `version`。
2. 到 Loki 按 `trace_id` 搜同一请求的全部日志。
3. 看 `event` 字段定位业务事件，看 `version` 判断是否某次发布引入。
4. 调用链上线后，再从 `trace_id` 跳 Tempo 看 DB / Redis / 外部 HTTP 耗时。

## 前端

前端遥测发送侧已在 `packages/common/src/monitoring`；接收端未上线。后续二选一：

- Grafana Faro / Grafana Cloud Frontend Observability；
- 自建 Faro 接收端。

不要在 Faro 之外再重复接一套前端 SDK。sourcemap 只用 hidden 方式归档，不公开。
