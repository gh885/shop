# infra — 基础设施

共享包。放**需要连库、连网、或者跟框架绑定**的东西。跟 `common` 的分界线只有一条：要不要外部资源。

## 四个子包

### web

| 类                       | 干什么                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `GlobalExceptionHandler` | HTTP 边界唯一的异常翻译点，吐 RFC 9457 `ProblemDetail`      |
| `RequestIdFilter`        | 每个请求一个可追溯 id，写 MDC + 回显 `X-Request-Id`         |
| `FieldValidationErrors`  | 把校验注解的结果翻成字段级明细（带 `rule` / `min` / `max`） |

错误响应的契约见 [errors.md](../../../../../../../../../docs/domain/errors.md)。

### security

| 类                                | 干什么                                              |
| --------------------------------- | --------------------------------------------------- |
| `SecurityConfig`                  | 过滤器链、无状态会话、JWT 解码/编码、密码编码器     |
| `AccessTokenIssuer`               | 签发访问令牌（只放身份，不放权限）                  |
| `OperatorAuthenticationConverter` | 令牌 → `CurrentOperator`，每请求回库取权限          |
| `Authorizer`                      | 判权唯一入口：`check` / `checkShop` / `current`     |
| `Permission`                      | 权限点枚举，跟 `common.permission` 表启动时双向比对 |
| `OperatorResolver`                | SPI：谁来解析操作人，由模块的 `api/` 实现           |

**认证全部交给 Spring Security + oauth2 resource-server**，没有手写的认证过滤器。
业务代码里不出现登录、验签、ThreadLocal——身份只有 `SecurityContextHolder` 一份来源。

指标口默认关着：`/actuator/prometheus` 需要令牌。本地靠 `apps/server/.env` 的 `SHOP_METRICS_PUBLIC=true` 打开，
生产没有那个文件所以自动保密。指标里有流量形态和内部名字，别在生产打开。

权限判断见 [access-control.md](../../../../../../../../../docs/domain/access-control.md)。

### event

| 类                      | 干什么                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| `EventInbox`            | 消费去重：`INSERT ... ON CONFLICT DO NOTHING` 看影响行数                 |
| `EventPublicationStore` | 登记表查询（补发任务 / 指标 / 管理端清单共用）+ 唯一写操作：清零重投计数 |
| `EventRetryJob`         | 补发：每 30 秒扫未完成登记重新投递（`shop.event.retry.enabled` 控制）    |
| `EventCleanupJob`       | 清理：每天删超过保留期的**已完成**登记与消费去重记录，未完成的永不删     |
| `EventAdminController`  | 管理端：未完成事件清单 + 超限事件放行（`EVENT_REPLAY`，平台员工）        |

去重表在 `common.consumed_event`，主键 `(consumer, event_id)`。

### cache

| 类            | 干什么                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CacheNames`  | 全站缓存名单，唯一登记处；spec 与名单双向比对，多一个少一个启动即失败                                                                                                                                                          |
| `CacheSpec`   | 单个缓存的形状：名字 + 值的精确 JavaType + TTL；逐缓存序列化，禁多态 `@class`                                                                                                                                                  |
| `CacheConfig` | RedisCacheManager：`transactionAware`（失效推迟到提交后）+ **immediateWrites**（SDR 4 默认延迟异步派发缓存写，evict 会在下一个读之后才落地，读写紧跟的场景必须钉死同步）+ `shop.cache.enabled=false` 退化为 NoOp（线上逃生口） |

模块侧的 spec 声明在各模块的 `internal/`（如 `catalog/internal/CatalogCacheConfig`），共享层不 import 模块类型。
`@Cacheable` 一律 `sync = true`（同 JVM singleflight）；写路径 `@CacheEvict`，TTL 只作兜底不作失效手段。

## Redis 使用口径

现在谁在用：限流（`RateLimiter`）、刷新令牌（`RefreshTokenStore`）、幂等（`Idempotency`）、
验证码/短信（`CaptchaService` / `SmsCodeService`）、热读缓存（`infra.cache`）。
业务层不直接持有 `StringRedisTemplate`——限流、幂等这类概念都有组件出口，Redis 是 infra 的实现细节。

三个故障语义是显式决定，不是实现巧合：

- **缓存 fail-open**：`shop.cache.enabled=false` 一键降级直读库；
- **限流 / 幂等 fail-closed**：Redis 挂掉时抛异常转 500——登录口失去节流和资金口失去幂等，宁可拒绝服务；
- **分布式锁不用 Redis**：`JobLock` 走 PG 会话级 advisory lock，与事务同生死。

## 依赖方向

**`infra` 可以 import 模块的 `api/`，反过来不行。**

这就是 SPI 的方向：`infra.security` 定义 `OperatorResolver` 接口，`seller.api` 实现它。
基础设施不认识业务，业务向基础设施注册——反过来就成了基础设施依赖所有模块，那个包会变成第二张模块地图。

## 不放什么

- 业务规则（折扣怎么算、订单能不能退）→ 模块的 `service`
- 通用工具函数（字符串处理、金额格式化）→ 那是 `common`，或者干脆不要

## 闭环状态

- 认证：**缺刷新令牌**。access 2 小时，到期只能重登。这是有意识的取舍，不是遗漏。
- 事件投递：**已闭环**。`EventRetryJob` 每 30 秒扫一遍未完成的登记（多实例靠 `JobLock` 互斥），
  按 `minAge` 避开正在跑的、按 `maxAttempts` 兜住永远失败的，超过 `stuckAfter` 打 WARN，
  并用两个指标暴露健康度：`shop.event.oldest_incomplete`（最老未完成事件的年龄，持续上涨 = 有消费者在失败）
  和 `shop.event.exhausted`（重投次数耗尽、等人工的事件数，大于 0 = 需要人）。
  `EventCleanupJob` 每天凌晨清掉已完成登记和消费去重记录（只删已完成的，未完成的是补发任务的病人）。
  超限事件的人工出口在 `EventAdminController`：清单看得见，requeue 清零重投计数后由补发任务重新捡起——
  放行前先修根因，重放的安全性由消费端去重和业务 CAS 保证。

- 数据范围：`checkShop` 靠手写调用，**没有查询层强制**。要做的话得在 `JdbcClient` 外面包一层，而不是靠 ORM 拦截器——项目里没有 ORM，见下条。

## 数据访问：JdbcClient + 手写 SQL

`infra/db/RowMappers` 是 record 行映射的唯一定义处。用 `DataClassRowMapper` 而不是手写 `RowMapper`：列名按驼峰自动对上，加列不用改映射代码。

**必须显式给 `ConversionService`。** 不给的话 Spring 用只认基本类型的默认转换器，所有 `status` 列（库里存小写）映射到枚举时直接抛 `Failed to convert value of type 'java.lang.String'`。`RowMappers` 里注册了一条约定：**库里存枚举名的小写**，统一按"大写后 `valueOf`"反解。

三个容易踩的点：

| 坑                | 表现                                                    | 规避                                             |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `:x::uuid[]`      | 双冒号被当成两个占位符，SQL 变成 `unnest(?, ?::uuid[])` | 写 `CAST(:x AS uuid[])`，参数传 `'{...}'` 字面量 |
| record 有计算字段 | 列不存在直接抛 `BadSqlGrammarException`                 | SQL 里用 `AS` 别名算出来，映射器不会调你的方法   |
| 可空列配基本类型  | `null` 转 `int` 抛 `TypeMismatchException`              | 可空列一律用包装类型                             |

**不引会藏写语义的框架。** MyBatis-Plus 的 `updateById` / JPA 的 `save` 生成的是 `WHERE id = ?`，没有任何状态前置条件——实测把一个已付款订单改回未付款，影响行数 1，成功。这个项目每一条写都是条件更新，0 行是判决不是异常，这类框架的默认写方法就是凭空开一个读改写的口子。`ArchitectureTest` 有规则拦 import（MyBatis-Plus / JPA / Hibernate 全仓禁用）；在用的 MyBatis 只走注解 SQL，条件写在 WHERE 里看得见。

## event 子包补记

`EventRetryJob` 只在 `shop.event.retry.enabled=true` 时装配。测试默认关掉它，补发自己有专门的测试打开。
重投本身也是写操作，所以三条边界必须同时在：够老才捡、次数有上限、不并发。

## scheduler 子包

`JobLock`：定时任务的多实例互斥，PG 会话级 advisory lock。每个 `@Scheduled` 任务入口都用
`jobLock.withLock("shop.job.<名>", ...)` 包住——拿不到锁 = 另一个实例在跑，静默跳过。
锁跟着连接走，所以它借一条连接、任务跑完在同一条上解锁；任务期间占住的那一个连接是有意的代价。
任务自身的关键写还有第二道闸（CAS 条件更新、`FOR UPDATE SKIP LOCKED` 认领），锁只是省掉无谓的重复跑。

`withLock` 同时是任务的**公共观测点**：持锁执行记 `shop.job.duration`、任务体抛异常记
`shop.job.failure`、锁被占走记 `shop.job.skipped`、任务体返回的处理条数记
`shop.job.processed`（tag 均为 `job`，取锁名去掉 `shop.job.` 前缀）。跑没跑、跑了多久、
失败没有、干了多少活，Prometheus 一屏看完；新任务走这里就自动被观测。

`ManualJob` / `JobRegistry` / `JobAdminController`：手动触发口。任务实现 `ManualJob`
（`jobName()` = 锁名，`runNow()` 就是 `@Scheduled` 那个方法——调度到点和管理端触发同一条路，
锁与幂等不因手动而绕过）。`POST /api/admin/jobs/{name}/trigger` 异步触发（202，虚拟线程），
`GET /api/admin/jobs` 列清单；权限点 `JOB_TRIGGER`（OPS / SUPER_ADMIN），还要平台员工身份。
触发结果不看响应看指标——响应只代表"已受理"。
