# 生产上线前置检查

上线前逐项勾选，任何一项失败都不发布。

## 配置与密钥

- [ ] `SHOP_JWT_PRIVATE_KEY` / `SHOP_JWT_PUBLIC_KEY` 使用独立密钥，不是开发临时密钥
- [ ] `SHOP_SECURITY_PEPPER` 已注入并与旧环境约定一致，确认轮换会让现有 refresh token 失效
- [ ] `SHOP_PAYMENT_PROVIDER` 明确为真实网关或受控 mock，生产禁止隐式 mock
- [ ] `SHOP_WEB_CORS_ALLOWED_ORIGINS` 只包含正式域名
- [ ] `SHOP_SERVER_FORWARDED_HEADERS` 只在可信反向代理后开启
- [ ] `SHOP_VERSION` 注入为本次构建的 git sha（不是 `latest` 之类的固定值），日志与前端上报按它关联发布
- [ ] 数据库、Redis、对象存储和支付密钥均来自 secret manager，不进入镜像和仓库

## 数据与迁移

- [ ] `SPRING_PROFILES_ACTIVE=prod`
- [ ] prod Flyway 只加载迁移，不加载 `db/seed`
- [ ] 在生产快照副本执行 `mvn verify`，确认 PG/Redis 集成测试通过
- [ ] 备份已完成并完成一次恢复演练
- [ ] `pnpm health:scan` 无孤立券、锁定超时券、超时待付款单或无库存上架商品

## 发布与回滚

- [ ] 先执行数据库迁移，再发布 web/seller/admin，再发布 server
- [ ] 迁移已向前兼容旧应用版本
- [ ] 保留上一版镜像和前端静态产物
- [ ] 回滚只回滚应用，不自动回滚数据库；数据库回滚需单独迁移和审批
- [ ] 发布后检查 `/actuator/health`、登录、商品详情、支付回调和物流 webhook

## 监控

- [ ] HTTP 请求量、错误率、p95 延迟可查询
- [ ] `auth.login.failed`、`order.created`、`payment.refunded` 等业务事件进入集中检索
- [ ] PostgreSQL 连接数、慢查询、磁盘和备份状态有告警
- [ ] Redis 内存、连接数和 key 命中率有告警
- [ ] 支付回调失败、退款失败、库存冻结异常有单独告警
