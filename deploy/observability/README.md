# 可观测性接入清单

当前应用侧已具备：

- `/actuator/prometheus`：Spring Boot + Micrometer 指标出口，所有指标带服务端 `application` / `env` / `version` 标签。
- ECS JSON 日志：每行带 `trace_id` / `version` / `env` / `event`，业务事件由 `BizEvent` 统一出口。
- 业务计数：`shop_biz_events_total{event,level}`。
- 对账：`ReconcileJob` 定时检查，差异打 `reconcile.mismatch`。
- 健康探针：`/actuator/health/liveness`、`/actuator/health/readiness`。

## 本机最小栈（pnpm obs:up）

本机栈是 Windows 静态二进制，状态放在 `~/.shop-obs`，不需要 Docker 或 WSL。

```bash
pnpm obs:up       # 准备二进制并启动本机栈
pnpm obs:status   # 查看三个组件的本机状态
pnpm obs:down     # 只停采集栈，不停数据面
```

Grafana 在 <http://localhost:3100/dashboards>；Prometheus 在 9090，Alertmanager 在 9093，均只供本机/受限网络访问。Grafana provisioning 读取本目录的 `grafana/dashboards`，包括 HTTP RED、业务事件、定时任务、依赖与 JVM、Web Vitals 五块看板；数据源为 `shop-prometheus`。

Web Vitals 看板路径为 `/d/shop-web-vitals`。只有部署了新采集端/接收端、浏览器产生有效样本、Prometheus 能抓到后端时才有数据；空看板不代表性能为零。

生产/内网部署不走这条，继续看下面的「最小自建栈」。

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

发送端在 `packages/common/src/monitoring`，接收端是 `POST /api/rum/events`，默认启用。三端使用 `web-vitals` 采 LCP / INP / CLS；不额外接第二套 RUM SDK。

Web Vitals 首次后台快照由 `RumVitals` 校验、Redis 去重后落入 Micrometer 的时间/CLS 桶。看板展示 p75、有效样本速率、非法/重复/去重不可用的丢弃计数。指标说明、发布边界和验证命令见 [前端监控约定](../../docs/conventions/frontend-monitoring.md#线上-web-vitals采集去重与分布)。

sourcemap 只用 hidden 方式归档，不公开；没有在本次变更中接入 sourcemap 还原或生产告警。
