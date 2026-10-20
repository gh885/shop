# infra — 基础设施

共享包。放**需要连库、连网、或者跟框架绑定**的东西。跟 `common` 的分界线只有一条：要不要外部资源。

## 三个子包

### web

| 类                       | 干什么                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `GlobalExceptionHandler` | HTTP 边界唯一的异常翻译点，吐 RFC 9457 `ProblemDetail`      |
| `RequestIdFilter`        | 每个请求一个可追溯 id，写 MDC + 回显 `X-Request-Id`         |
| `FieldValidationErrors`  | 把校验注解的结果翻成字段级明细（带 `rule` / `min` / `max`） |

错误响应的契约见 [errors.md](../../../../../docs/domain/errors.md)。

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

权限判断见 [access-control.md](../../../../../docs/domain/access-control.md)。

### event

| 类           | 干什么                                                   |
| ------------ | -------------------------------------------------------- |
| `EventInbox` | 消费去重：`INSERT ... ON CONFLICT DO NOTHING` 看影响行数 |

去重表在 `common.consumed_event`，主键 `(consumer, event_id)`。

## 依赖方向

**`infra` 可以 import 模块的 `api/`，反过来不行。**

这就是 SPI 的方向：`infra.security` 定义 `OperatorResolver` 接口，`seller.api` 实现它。
基础设施不认识业务，业务向基础设施注册——反过来就成了基础设施依赖所有模块，那个包会变成第二张模块地图。

## 不放什么

- 业务规则（折扣怎么算、订单能不能退）→ 模块的 `service`
- 通用工具函数（字符串处理、金额格式化）→ 那是 `common`，或者干脆不要

## 闭环状态

- 认证：**缺刷新令牌**。access 2 小时，到期只能重登。这是有意识的取舍，不是遗漏。
- 事件投递：**已闭环**。`EventRetryJob` 每 30 秒扫一遍未完成的登记，按 `minAge` 避开正在跑的、
  按 `maxAttempts` 兜住永远失败的，超过 `stuckAfter` 打 WARN，并用 `shop.event.oldest_incomplete`
  这个指标把「最老未完成事件的年龄」暴露出去——那是整条事件链路唯一值得盯的数字。

    还差一件：**多实例要加数据库锁**。现在靠 `fixedDelay` 保证单实例内不重入，两台机器同时跑会重复投递。

- 数据范围：`checkShop` 靠手写调用，**没有查询层强制**。等第一个真实查询出现时补 MyBatis 拦截器。

## event 子包补记

`EventRetryJob` 只在 `shop.event.retry.enabled=true` 时装配。测试默认关掉它，补发自己有专门的测试打开。
重投本身也是写操作，所以三条边界必须同时在：够老才捡、次数有上限、不并发。
