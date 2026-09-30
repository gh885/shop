# 可观测性接入清单

当前应用侧已具备：

- `/actuator/prometheus`：Spring Boot + Micrometer 指标出口，所有指标带 `application` / `env` / `version` 标签。
- ECS JSON 日志：每行带 `trace_id` / `version` / `env` / `event`，业务事件由 `BizEvent` 统一出口。
- 业务计数：`shop_biz_events_total{event,level}`。
- 对账：`ReconcileJob` 定时检查，差异打 `reconcile.mismatch`。
- 健康探针：`/actuator/health/liveness`、`/actuator/health/readiness`。

## 本机最小栈（pnpm obs:up）

云主机配置不够时，本机也能把采集栈跑起来看趋势——三个组件都是静态二进制，装在 WSL Ubuntu 的 `/opt/shop-obs`，由 **systemd 单元**托管（不开 Docker）。一条命令：

```bash
pnpm obs:up       # 装二进制（幂等）+ 写单元 + 启动 + 健康探测
pnpm obs:status   # 各单元状态、抓取目标健康度、vmmemWSL 内存
pnpm obs:down     # 停三个单元（不动数据面）
```

- 启动后 Grafana 在 <http://localhost:3000/dashboards>（admin / shop，仅本机）；已 provision 4 块看板（HTTP RED / 业务事件 / 定时任务 / 依赖与 JVM），数据源 `shop-prometheus`。
- 后端不用改一行：Prometheus 直接抓 `127.0.0.1:8080/actuator/prometheus`（WSL2 镜像网络让 localhost 跨 Windows↔WSL 共享）。
- **和 `db:down` 的边界**：`obs:down` 只停本栈，绝不 `wsl --shutdown`；`db:down` 会 `wsl --shutdown` 连坐带走 PG/Redis（它才是还内存的动作）。本栈不碰数据库，与 `SHOP_DATASTORE` 无关。
- 单元是 `enable` 的，WSL 重启后会自动拉起（除非 obs:down 停过）。
- 首次装 grafana 要下 ~460MB（tarball），到 dl.grafana.com 约 0.8MB/s，脚本会自动断点续传直到 sha256 对上，可能要几分钟。
- 已知坑：WSL 镜像网络的 Windows→WSL 回环偶发断（页面突然打不开）。跑任意一条 `wsl.exe` 命令（如 `pnpm obs:status`）即可恢复；脚本内部也对 WSL 服务抖动（`0x8007274c`）做了重试。

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

前端遥测发送侧已在 `packages/common/src/monitoring`；接收端未上线。后续二选一：

- Grafana Faro / Grafana Cloud Frontend Observability；
- 自建 Faro 接收端。

不要在 Faro 之外再重复接一套前端 SDK。sourcemap 只用 hidden 方式归档，不公开。
