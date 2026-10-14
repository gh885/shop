# 可观测性接入清单

当前应用侧已具备：

- `/actuator/prometheus`：Spring Boot + Micrometer 指标出口，所有指标带服务端 `application` / `env` / `version` 标签。
- ECS JSON 日志：每行带 `trace_id` / `version` / `env` / `event`，业务事件由 `BizEvent` 统一出口。
- 业务计数：`shop_biz_events_total{event,level}`。
- 对账：`ReconcileJob` 定时检查，差异打 `reconcile.mismatch`。
- 健康探针：`/actuator/health/liveness`、`/actuator/health/readiness`。
- 采集端：[`alloy/config.alloy`](alloy/config.alloy)，Grafana Alloy 一个进程抓 `/actuator/prometheus` + 读 ECS 日志文件，推 Grafana Cloud（见下「生产形态」）。

## 本机最小栈（pnpm obs:up）

本机栈是 Windows 静态二进制，状态放在 `~/.shop-obs`，不需要 Docker 或 WSL。

```bash
pnpm obs:up       # 准备二进制并启动本机栈
pnpm obs:status   # 查看三个组件的本机状态
pnpm obs:down     # 只停采集栈，不停数据面
```

Grafana 在 <http://localhost:3100/dashboards>；Prometheus 在 9090，Alertmanager 在 9093，均只供本机/受限网络访问。Grafana provisioning 读取本目录的 `grafana/dashboards`，包括 HTTP RED、业务事件、定时任务、依赖与 JVM、Web Vitals 五块看板；数据源为 `shop-prometheus`。

Web Vitals 看板路径为 `/d/shop-web-vitals`。只有部署了新采集端/接收端、浏览器产生有效样本、Prometheus 能抓到后端时才有数据；空看板不代表性能为零。

生产部署不走这条，看下面的「生产形态」。

## 生产形态：Grafana Cloud + Alloy

主机（2C / 1.6G）塞不下自建栈，采集栈走 Grafana Cloud 免费档（指标 1 万活跃序列 / 日志 50GB / 保留 14 天），主机上只跑一个 Alloy。决策与备选见 [ADR 0005](../../docs/adr/0005-observability-hosting.md)。

**凭据**全部在 `deploy/observability/.env.local`（gitignored），逐项来源与 scope 见同目录 [`.env.example`](.env.example)。两枚 access policy token 分工：collector（`metrics:write` + `logs:write`，上主机）、admin（读 + `rules` 读写，只在本机跑同步与验证）；另有 Grafana 服务账号 token（Admin 角色）给同步脚本推看板、规则与通知。Grafana Cloud 只给 org 成员的邮箱发告警。

**采集端**：[`alloy/config.alloy`](alloy/config.alloy)。不含任何值——端点、凭据、抓取目标（`SHOP_METRICS_TARGET`，默认 `127.0.0.1:8080`）、日志路径（`SHOP_LOG_FILE`）全部读环境变量，本机与主机同一份。

**同步**（幂等，重跑只覆盖）：

```bash
pnpm obs:cloud:sync            # 文件夹 Shop + 5 看板 + 10 规则 + 邮件 contact point + 根路由
pnpm obs:cloud:sync --pause    # 同上，规则整体暂停 —— 主机上线前保持这个状态；上线当天不带 --pause 重跑
```

云端是仓库的只读副本：改看板 JSON 或 `prometheus/shop-alerts.yml` 后重跑即可。规则导入走 Grafana 的 convert API，保住 Prometheus 语义（查无数据 = Normal）；两条实测约束：别传 folder-uid 头（会嵌套目录），一条规则里别混异构标签集（`or absent()` 已拆开），详见 ADR 0005。

**本机联调**（不依赖主机，验证配置与凭据；2026-10-12 全链路验证过）：

```bash
node scripts/ensure-datastore.mjs --hold                 # 数据面隧道（别经 pnpm：它跑脚本前会先装依赖）
mvn -f apps/server/pom.xml spring-boot:run               # 后端；dev 自带 ECS JSON 落 apps/server/logs/shop-server.log
set -a; . deploy/observability/.env.local; set +a
export SHOP_LOG_FILE="$(cygpath -m "$PWD")/apps/server/logs/shop-server.log"
~/.shop-obs/bin/alloy-<ver>/alloy-windows-amd64.exe run --storage.path ~/.shop-obs/data/alloy deploy/observability/alloy/config.alloy
```

Alloy 二进制从 GitHub releases 下载、sha256 核对后放 `~/.shop-obs/bin/`。起来后 30 秒内 Explore 里应能查到 `up{job="shop-server"}`，日志按 `{job="shop-server"} | json | trace_id="…"` 能捞回一次请求的全部行。演练：停后端 → `ShopServerTargetDown` 约 4 分钟 Firing → 邮件；恢复 → RESOLVED 邮件。

## 最小自建栈（备选，当前未采用）

主机资源够、或不想依赖托管时再走这条。推荐顺序，不要一开始上全家桶：

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

1. 告警邮件 / Alerting 页看 `alertname` / `event` / `uri` / `status` / `version`。
2. Grafana Cloud → Explore → Loki：`{job="shop-server"} | json | trace_id="<id>"` 捞同一请求的全部行（`trace_id` / `event` / `env` / `version` 都是顶层键；接口错误响应里的 `requestId` 就是它）。
3. 看 `event` 字段定位业务事件，看 `version` 判断是否某次发布引入。
4. 调用链上线后，再从 `trace_id` 跳 Tempo 看 DB / Redis / 外部 HTTP 耗时。

## 前端

发送端在 `packages/monitoring/src`，接收端是 `POST /api/rum/events`，默认启用。三端使用 `web-vitals` 采 LCP / INP / CLS；不额外接第二套 RUM SDK。

Web Vitals 首次后台快照由 `RumVitals` 校验、Redis 去重后落入 Micrometer 的时间/CLS 桶。看板展示 p75、有效样本速率、非法/重复/去重不可用的丢弃计数。指标说明、发布边界和验证命令见 [前端监控约定](../../docs/conventions/frontend-monitoring.md#线上-web-vitals采集去重与分布)。

sourcemap 只用 hidden 方式归档，不公开；没有在本次变更中接入 sourcemap 还原或生产告警。
