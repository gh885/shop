# 业务事件日志约定

业务事件日志 = 业务代码手动埋点 + 框架自动补信封字段。埋点只有一个出口：`BizEvent`（`com.shop.platform.infra.observability.BizEvent`）。

## 格式

```java
// 框架已自动注入信封：trace_id, version, env（RequestIdFilter）
BizEvent.of("order.created")
        .put("order_id", orderId)      // UUID / int / 枚举直接传，不必在调用点转字符串
        .put("user_id", maybeNull)     // 值为 null 即跳过该字段，不必写 if
        .emit();                       // 成功/中性；另有 warn() / error() / error(cause)
```

输出（ECS 格式 JSON）：

```json
{
    "@timestamp": "2026-07-29T10:00:01.123Z",
    "log.level": "INFO",
    "message": "order.created order_id=12345",
    "service.name": "shop-server",
    "trace_id": "abc123",
    "version": "0.0.1-SNAPSHOT",
    "env": "dev",
    "event": "order.created",
    "order_id": "12345"
}
```

`event` 是检索/聚合/告警的唯一依据。`message` 由 `BizEvent` 按「事件名 + 同一批字段」生成，**调用点不再手写文案**：
分成两份写就一定会漂——`shop_review.decided` 的字段是 `decision=APPROVED`，当年手写的 message 却打
`status=TRADING`（那是店铺营业状态，不是审核决定），按 message 理解日志的人就拿到错的结论。

终止方法（`emit/warn/error`）同时是「打这行」：旧的 `try (MdcScope scope = MdcScope.of("event", ...)) { log.info(...) }`
形状把「埋字段」和「打日志」拆成两步，忘了第二步就是一个静默丢失的事件——MDC 里写过了、日志里根本没有，
编译器与测试都不会响。`MdcScope` 仍然留着，但只管信封与上下文（`RequestIdFilter` 的 trace_id/version/env）。

代码与下面的目录由 `BusinessEventCatalogTest` 逐条核对（无库、纯文本）：事件名双向相等、目录里的必带字段每个埋点都写、
埋点写的字段目录里都得列着、命名与 reason/实体 ID 规则、以及「不许绕过 `BizEvent` 手写 `event`」。

## 命名规则

```
领域实体.动词过去式       ← 成功/中性事件
领域实体.动词.failed     ← 失败事件
```

| 正确 ✅                 | 错误 ❌         |
| ----------------------- | --------------- |
| `order.created`         | `订单创建成功`  |
| `payment.charge.failed` | `createOrder`   |
| `auth.login.succeeded`  | `order_created` |

## 已有事件目录

| event                              | 必带字段                                                                                                                                                     | 来源                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `http.request`                     | `method`, `path`, `status`, `latency_ms`, `client_ip`, `locale`, `timezone`                                                                                  | HttpRequestLoggingInterceptor 每个请求自动；后两个来自 LocaleFilter，排查「这个用户为什么看到中文」用 |
| `auth.login.succeeded`             | `user_id`, `via`                                                                                                                                             | AuthService.loginBySms / loginByPassword（打在两个登录入口，不打在共用的签发方法里）                  |
| `auth.login.failed`                | `reason`（枚举值: user_not_found / no_password / wrong_password / disabled / rate_limited）, `client_ip`; `user_id` 可选，未注册那支没有它、改带掩码 `phone` | AuthService.loginRejected / ensureLoginActive / rejectIfRateLimited                                   |
| `auth.token.refreshed`             | `user_id`                                                                                                                                                    | AuthService.refresh（旧码消费、新码签发＝一次会话易主，不是登录）                                     |
| `auth.password.changed`            | `user_id`, `via`（self / reset_code）                                                                                                                        | AuthService.setPassword 与 resetPassword：两条路径同一后果（口令更换 + 全端下线）                     |
| `account.status.changed`           | `user_id`, `status`, `staff_id`                                                                                                                              | AuthService.updateUserStatus（`staff_id` 是操作人，控制器从 StaffContext 取）                         |
| `staff.login.succeeded`            | `staff_id`                                                                                                                                                   | StaffService.login（平台员工，kind=staff token）                                                      |
| `staff.login.failed`               | `reason`（枚举值: staff_not_found / wrong_password / disabled / rate_limited）, `client_ip`; `staff_id` 与掩码 `employee_no` 二选一，查无此工号时只有后者    | StaffService.loginRejected / login / rejectIfRateLimited                                              |
| `staff.status.changed`             | `staff_id`, `status`, `operator_id`                                                                                                                          | StaffService.updateStaffStatus（两个都是员工 id，被禁者与操作人不能共用键名）                         |
| `trade.created`                    | `trade_id`, `user_id`, `pay_amount`（Money 整体入表）, `shop_count`                                                                                          | OrderService.create：一次结算一张主订单；子订单数与总应付不做第二份拷贝，明细由 order.created 承载    |
| `order.created`                    | `order_id`, `trade_id`, `user_id`, `shop_id`, `pay_amount`（Money 整体入表）                                                                                 | OrderService.create：多店结算一次产出 N 条，同批共享 trade_id；单数与总应付由检索侧聚合               |
| `shop_review.decided`              | `review_id`, `shop_id`, `decision`, `staff_id`                                                                                                               | ShopReviewService.decide                                                                              |
| `payment.refund.failed`            | `reason`（枚举值: gateway_rejected）, `order_id`, `refund_no`; gateway_rejected 分支带 `error.type` / `error.message`                                        | PaymentRefundCommand（渠道拒退；退款单落一条失败执行记录并等重试）                                    |
| `payment.refunded`                 | `order_id`, `refund_no`, `amount`（Money 整体入表，不拆 amount/currency）, `gateway_refund_no`                                                               | PaymentRefundCommand（渠道受理并累计流水已退额；退款单确认成功时才推进状态）                          |
| `user.deleted`                     | `user_id`, `address_count`                                                                                                                                   | AccountDeletionExecutor（注销冷静期满生效，个保法第 47 条）                                           |
| `order.receiver_phone_revealed`    | `shop_id`, `order_id`, `operator_id`                                                                                                                         | OrderService.sellerReceiverPhone（卖家逐单取买家电话明文；号码本身不入日志，ORD-62）                  |
| `shop_review.owner_phone_revealed` | `review_id`, `shop_id`, `staff_id`                                                                                                                           | ShopReviewService.ownerPhone（平台逐条取店主电话明文，ACC-79）                                        |
| `shop_subaccount.phone_revealed`   | `shop_id`, `subaccount_id`, `operator_id`                                                                                                                    | ShopSubaccountService.revealPhone（店主逐条取子账号电话明文；号码本身不入日志，ACC-79）               |
| `review.created`                   | `review_id`, `order_id`, `user_id`, `shop_id`, `item_count`                                                                                                  | ReviewService.submit（整单一次提交，逐订单行打分；REV-16）                                            |
| `review.appended`                  | `review_id`, `order_id`, `user_id`                                                                                                                           | ReviewService.append（追评一次）                                                                      |
| `review.replied`                   | `review_id`, `shop_id`, `operator_id`                                                                                                                        | ReviewService.reply（卖家回复一次）                                                                   |
| `logistics.tracking_query.failed`  | `reason`（枚举值: gateway_error / empty_response / parse_error / carrier_rejected）, `carrier_code`; `error.type` / `error.message`                          | KdniaoTrackingGateway.fetchTracker（快递鸟即时查询失败，网络异常、空响应、解析失败或渠道拒绝）        |
| `reconcile.mismatch`               | `check`, `count`                                                                                                                                             | ReconcileJob（应用内定时对账，只读检查发现数据不一致）                                                |

## 新增事件规则

1. 新增公共依赖（出站 HTTP、MQ 等）时，先补埋点进事件目录再上线，不允许先上线后补
2. 什么才立一条事件：一次有业务后果的状态变更、一笔资金、一次「谁动了谁的数据」的审计。流程叙述与诊断信息
   （验证码已发送、缓存命中）留普通 `log.info`，不占目录位——目录里每一条都要有人按它检索，否则它就是纯维护成本
3. 失败事件必有 `reason`（枚举值）；因渠道或异常而失败的那些，再带 `error.type`、`error.message`
4. 成功事件必带该实体的 ID，如 `order_id`、`user_id`
5. 事件名永远是短标识，不能是中文或函数名；段内可以多词蛇形（`order.receiver_phone_revealed`），段首段尾不行
6. 同一件事的多条路径共用一个事件名，用字段区分（`via` / `reason`），不另起事件名——否则聚合时要先知道有几条路径
7. 业务规则文档讲到后果时可以直接指名事件，但要用反引号包成 `order.created` 这样的事件名形状——
   `BusinessEventCatalogTest` 扫 `docs/business-rules` 的反引号名，指到目录里没有的就红（GEN-50 禁的是抄字段表，不是禁指名）

## 延后项（带触发条件）

- **DB 查询埋点与 DB 指标**：待 MyBatis-Plus 拦截器或数据源代理实现；当前用 PG 慢查询日志兜底
- **告警**：需要 Prometheus + Alertmanager 部署环境；`/actuator/prometheus` 指标已可获取
- **全局敏感字段审计**：手机号靠 `PhoneNumber.mask()` 在出参与日志调用点逐个掩（卖家侧口径见 ORD-62），但没有一次覆盖全部字段的全局审查；接真实支付/更多个人数据前做
- **出站调用 trace 传播**：已有出站 HTTP（快递鸟），尚无 MQ；`micrometer-tracing` 未引入。出站客户端的构建约定与触发条件见 [observability.md](observability.md) 契约第 5 条与延后项
- **员工侧会话续期**：买家侧立了 `auth.token.refreshed`，员工侧没有——目前没有会去查「被封员工的会话还在续」的场景，
  真出现这种排查需求时补一条，不预先占目录位

## 注意事项

- 业务事件一律经 `BizEvent`（一次调用写完字段并打出那行）；`MdcScope` 只用于信封/上下文字段，不要拿它手写 `event`——目录门禁会红
- 不要往 MDC 放敏感信息（密码、token、身份证号等）；手机号只能以 `PhoneNumber.mask()` 的形状进字段
- `event` 是检索/聚合/告警的唯一依据，`message` 由 `BizEvent` 生成，调用点不写文案
- 失败事件（`*.failed`）必有 `reason` 字段（枚举值，非自由文本）
