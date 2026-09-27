# 生产上线前置检查

上线前逐项勾选，任何一项失败都不发布。变量名的落点都写在本条后面，**别照记忆填**：prod 的占位符大多没有默认值，名字写错的表现是「启动即失败」，而不是「用了个默认值」。完整可复制的清单在 `apps/server/.env.example`（本地开发一个变量都不用设，默认 profile 自带 dev 取值）。

## 配置与密钥 —— 后端必填

`application-prod.yml` 里以 `${VAR}` 形状出现、**无默认值**的项，漏配一个后端就起不来。

- [ ] `SHOP_VERSION` 注入为本次构建的 git sha（如 `git rev-parse --short HEAD`），不是 `latest` 之类的固定值。它进每行日志信封的 `version`（`spring.application.version` → `RequestIdFilter`），也是前端上报与 sourcemap 归档的关联键（[frontend-monitoring.md](../conventions/frontend-monitoring.md) 契约 4）
- [ ] `SPRING_DATASOURCE_URL` / `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD`。**prod 的库地址整体来自这三项**：`SHOP_DB_PORT` 只被 dev/test 的 `application.yml` / `application-test.yml` 读，prod 没有它的位置
- [ ] `SPRING_DATA_REDIS_HOST`（`SPRING_DATA_REDIS_PORT` 默认 6379）；`SPRING_DATA_REDIS_PASSWORD` 默认空——留空要确认过网络隔离，别把「没密码」当默认
- [ ] `SHOP_SECURITY_PEPPER`（`openssl rand -hex 32`）。验证码与 refresh token 落 Redis 前的 HMAC 密钥，泄露 = 可离线伪造凭证；轮换会让全体在途 refresh token 失效（用户重新登录），与旧环境约定一致再切
- [ ] `SHOP_JWT_PRIVATE_KEY` / `SHOP_JWT_PUBLIC_KEY`（ES256，base64 PKCS#8 私钥 + X.509 公钥）。生产必须固定：不固定则重启换密钥、多实例无法互验；与开发临时密钥不是同一对
- [ ] `SHOP_WEB_CORS_ALLOWED_ORIGINS`：逗号分隔的**完整来源**（含协议与端口）。同源反代部署时 CORS 不参与，填站点自身域名即可；不要带着 `.env.example` 里的 `example.com` 占位上线
- [ ] **短信通道已接真实实现**，`SHOP_AUTH_SMS_CHANNEL` 给非 dev 值。注意这不是「配一个变量」就完事：`application-prod.yml` 把它做成必填占位符，而仓库里只有 `DevSmsChannel`（固定码 `666666` + 验证码打日志）——没有一个实现 `SmsChannel` 的真实通道 bean 之前，这一项**过不去**，别用「先填个真值」糊过去（填了也装配不出通道）
- [ ] 数据库、Redis、对象存储密钥全部来自 secret manager / 平台注入，不进入镜像和仓库（`apps/server/.env` 已被 gitignore，仓库里只许有 `.env.example`）

## 配置与密钥 —— 按部署拓扑与渠道

- [ ] `SHOP_WEB_TRUST_FORWARDED_FOR`：只在**会覆写 `X-Forwarded-For` 的可信反向代理**之后设 `true`。没有反代却设 true 的后果是 IP 限流可被伪造头绕过（不是「不生效」，是「可被绕过」）。仓库里没有 `SHOP_SERVER_FORWARDED_HEADERS` 这个变量，别找
- [ ] `SHOP_AUTH_REFRESH_COOKIE_DOMAIN`：买家端与卖家端共享父域（如 `.example.com`）才做跨子域单点登录；留空 = 各站独立会话。admin 走独立 staff 账号体系，不在这条路上
- [ ] `SHOP_AUTH_SMS_IP_DISTINCT_PHONES_MAX`（默认 30）：CGNAT / 公司出口 / 校园网下大量真实用户共享出口 IP，按实际分布调；调低会误伤正常注册
- [ ] `SHOP_LOG_FILE`（默认 `/var/log/shop/shop-server.log`）：目录存在且可写，文件输出是 ECS JSON（`logging.structured.format.file: ecs`），集中检索按它解析
- [ ] 快递鸟（轨迹查询与推送）：`SHOP_KDNIAO_ENABLED=true` + `SHOP_KDNIAO_EBUSINESS_ID` + `SHOP_KDNIAO_APP_KEY`。不配也能启动，代价是轮询任务与 `POST /logistics/webhooks/{carrierCode}` 都不工作——推送端点 fail-close，无密钥一律 403；轨迹退化成「运营经管理端补录」。这条是**产品决定**，要显式记下上线日有没有接
- [ ] 七牛图片直传（选配）：`QINIU_ACCESS_KEY` / `QINIU_SECRET_KEY` / `QINIU_BUCKET` / `QINIU_UPLOAD_HOST` / `QINIU_PUBLIC_BASE_URL`。AK/SK 泄露等于账号裸奔；不传图可不配，但传图的接口一旦有人调就会明确报错（`QiniuClient.ensureConfigured`）
- [ ] 图形验证码：prod 写死 `shop.auth.captcha-channel: real`，**没有环境变量可配**（故意不接，接了反而多一个误配成 `dev` 的口子）。要出现「生产也放行固定码」的状态，只能改代码

## 配置与密钥 —— 支付现在是个空洞

- [ ] **明确记录：支付渠道只有 MOCK 一种实现，且没有开关。** `PaymentGateway` 唯一实现是 `payment/gateway/MockPaymentGateway`，`payment.payments.channel` 恒为 `MOCK`（`Payment.CHANNEL_MOCK`），买家「确认支付」是 `POST /payments/{id}/confirm`（闸门只有「调用人是这笔流水的买家」，它不是资金证明，见 `PaymentController` 类注释）。仓库里**不存在** `SHOP_PAYMENT_PROVIDER` 这类变量，也没有「隐式 mock」可禁——上线真金白银前，缺的是一个真实 `PaymentGateway` 实现 + 渠道侧回调验签，而不是往 `.env` 里加一行

## 前端构建期变量（`VITE_*`，打包时烘进产物，不是运行时）

- [ ] web：`VITE_BACKEND_URL`（SSR loader 拉后端的绝对地址；浏览器端走同源代理用不到它，漏配等于 SSR 全部请求打 `localhost:8080`）、`VITE_SITE_ORIGIN`（`canonical` / `og:url` 与 router origin 的唯一来源，漏配会把 `localhost:3000` 写进 meta）、`VITE_SELLER_URL`（跨 SPA 跳卖家中心）、`VITE_IMAGE_BASE_URL`
- [ ] seller / admin：`VITE_BACKEND_URL`（Vite proxy 目标，见各自 `vite.config.ts`）、seller 另有 `VITE_IMAGE_BASE_URL`
- [ ] 图片域名不是七牛测试域名：`*.clouddn.com` 的 HTTPS 证书不受信任（浏览器 `ERR_CERT_COMMON_NAME_INVALID`），只能走 http。生产必须是自有备案 CDN 域名 + HTTPS（`apps/web/.env.example` 头注释就是这件事）
- [ ] 三端各自的 `.env.example` 与真实构建环境比对过；`VITE_*` 是弱类型 string，web 侧由 `apps/web/src/shared/lib/env.ts` 用 zod 在模块加载时兜一次（非法值退回本地默认，不是构建失败——**漏配不会被 CI 拦住，只能靠这条勾选**）

## 数据与迁移

- [ ] `SPRING_PROFILES_ACTIVE=prod`（不设等于跑 dev profile：临时 JWT 密钥 + 固定验证码）
- [ ] prod Flyway 只加载迁移：`locations: classpath:db/migration`，不含 `db/seed`（`application-prod.yml` 已这么写，勾这格是确认没被部署平台的同名变量覆盖）——那两条 seed 迁移带 `TRUNCATE` 且会把 picsum 占位商品灌进真店
- [ ] `flyway_schema_history` 里治理相关的三条都在位：`V69__audit_records`（审计账本 + 三条索引）、`V70__review_module`（评价）、`V71__coupon_discount_and_relative_validity`；缺哪条就是迁移没跑完
- [ ] 在生产快照副本执行 `mvn -f apps/server/pom.xml verify`，确认 PG/Redis 集成测试通过。副本要指到专用库：测试上下文读 `src/test/resources/application-test.yml`（`127.0.0.1:${SHOP_DB_PORT:15432}/shop_test`），端口/库名/账密用 `SHOP_DB_PORT` / `SHOP_DB_NAME` / `SHOP_DB_USER` / `SHOP_DB_PASSWORD` 覆盖，别改文件；副本上跑之前确认没人拿它当业务库（IT 会写数据）
- [ ] 跑 `mvn verify` 前数据面在位：本地 PG 在 WSL2（`pnpm db:up` 拉起、`pnpm db:down` 还内存）。这族变量只在本地与 CI 有意义——`SHOP_DB_PORT`（本地 15432 是 Windows 侧端口被占换来的口径，CI 的 PG service 在 5432 由 workflow 覆盖）、`SHOP_WSL_DISTRO`（换发行版）、`SHOP_WSL_KEEPALIVE=0`（完全不挂会话）。后端突然连不上库多半是 WSL VM 被回收，不是代码坏了，机制见 `scripts/ensure-datastore.mjs` 头注释
- [ ] 备份已完成并完成一次恢复演练
- [ ] `pnpm health:scan` 干净：四项只读检查（孤立用户券 / 锁定超时用户券 / 超时待付款订单 / 在架但无可售库存的商品）全 `OK`。前置条件是 **PATH 里有 `psql`**（CI 的 e2e job 显式 `apt-get install -y postgresql-client` 就是为了这个）；本机 Windows 侧默认没有 `psql`（库跑在 WSL，`seed-demo` 是走 `wsl.exe` 通道连它的），要么装 client 要么把这条检查在 CI 里跑。库连不上或 `psql` 缺失会打 `ERROR <检查名>` 并以 1 退出，**那是没跑成，不是数据有问题**，别按「已核对」勾这一格
- [ ] 库存口径注意：库存在 `inventory.sku_stock`（V19 起），可用量 = `stock - frozen_stock`；`product.skus` 上没有 `stock` 列。任何临时排查 SQL 写了 `product.skus.stock` 都是错的（`ops-health-scan.mjs` 就踩过这个坑）

## 发布与回滚

- [ ] 先执行数据库迁移，再发布 web/seller/admin，再发布 server
- [ ] 迁移已向前兼容旧应用版本（新增列可空或有默认；不给已有列加 `NOT NULL CHECK` 而不留退路）
- [ ] 保留上一版镜像和前端静态产物
- [ ] 回滚只回滚应用，不自动回滚数据库；数据库回滚需单独迁移和审批
- [ ] 发布后逐个真点一遍：`/actuator/health`（DB + Redis 自动探测）、买家密码登录、商品详情、下单 → MOCK 渠道确认支付 → 订单状态推进、卖家发货、承运商推送 `POST /logistics/webhooks/{carrierCode}`（**只有接了快递鸟密钥才有意义**，没接就明确记「未覆盖」而不是勾掉）。没有「支付回调」这个端点可查，见上面支付一节
- [ ] `/actuator/prometheus` 只在网关侧限制来源后暴露（`application.yml` 的注释已点名这条；暴露的只有 `health,prometheus` 两个端点，别顺手再加）

## 监控

采集栈（Prometheus + Alertmanager + Grafana，日志进 Loki 或云 SLS）是**上线前置**，不是延后项——见 [observability.md](../conventions/observability.md) 延后项表的第 1 行。下面每条要么能查到，要么记「已知没有」：

- [ ] HTTP 请求量、错误率、p95 延迟可查询（`http_server_requests_seconds_bucket` 已在导出，p95 由 Prometheus 侧算，不在应用里算）
- [ ] `auth.login.failed`、`order.created`、`payment.refunded` 等业务事件能按 `event` 字段检索（唯一出口 `BizEvent`，事件目录与必带字段见 [business-event-logging.md](../conventions/business-event-logging.md)）
- [ ] 按 `version` / `env` 过滤能分出「哪次发布」——`SHOP_VERSION` 没注入时这两格是 dev 默认值，看板上分不出灰度
- [ ] 定时任务停摆有告警：`tasks_scheduled.execution` 的 `_count` 按 `code_namespace` / `code_function` 配 `increase(...[N 个周期]) == 0`，并用 `absent()` 兜住「第一轮还没跑完没有序列」；单笔失败另看 `shop.sweep.failures{job}`（首次失败才注册，平时 Prometheus 里没这条序列属正常）
- [ ] PostgreSQL 连接数、慢查询、磁盘和备份状态有告警
- [ ] Redis 内存、连接数和 key 命中率有告警
- [ ] 支付确认失败、退款失败（`payment.refund.failed` 的 `reason`）、库存冻结异常有单独告警
- [ ] 治理动作的账本可查：`audit.audit_records` 的查询与导出、缺行怎么判，见 [audit-runbook.md](audit-runbook.md)
