# 业务事件日志约定（依据 observability-checklist.md BEV-* / INS-04）

业务事件日志 = 业务代码手动埋点 + 框架自动补信封字段。

## 格式

```java
// 框架已自动注入到 MDC：trace_id, version, env
// 业务填 event（MDC 单独 key） + 场景字段（MDC）
MDC.put("event", "order.created");
MDC.put("order_id", "12345");
try {
    log.info("");  // message 留空，event 和字段都在 MDC 中
} finally {
    MDC.remove("event");
    MDC.remove("order_id");
}
```

输出（ECS 格式 JSON）：

```json
{
    "@timestamp": "2026-07-29T10:00:01.123Z",
    "log.level": "INFO",
    "message": "",
    "service.name": "shop-server",
    "trace_id": "abc123",
    "version": "0.0.1-SNAPSHOT",
    "env": "dev",
    "event": "order.created",
    "order_id": "12345"
}
```

`event` 是检索/聚合/告警的唯一依据，`message` 留空或放给人读的描述。

## 命名规则（BEV-01）

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

| event                  | 必带字段                                                                                       | 来源                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `http.request`         | `method`, `path`, `status`, `latency_ms`, `client_ip`                                          | HttpRequestLoggingInterceptor 每个请求自动 |
| `auth.login.succeeded` | `user_id`                                                                                      | AuthService.issueTokens                    |
| `auth.login.failed`    | `reason`（枚举值: user_not_found / no_password / wrong_password）, `client_ip`; `user_id` 可选 | AuthService.authenticate                   |

## 新增事件规则

1. 命名走 BEV-01：`名词.动作过去式` / `名词.动作.failed`
2. 失败事件必有 `error.type`、`error.message`（BEV-02）
3. 成功事件必带该实体的 ID，如 `order_id`、`user_id`（BEV-03）
4. 事件名永远是短标识，不能是中文、函数名、蛇形（BEV-04）

## 注意事项

- 用 `MDC.put/remove` + try-finally 包裹，防止字段泄露到其他日志
- 不要往 MDC 放敏感信息（密码、token、身份证号等）
- `event` 是检索/聚合/告警的唯一依据，`message` 留空或放给人读的描述
- 失败事件（`*.failed`）必有 `reason` 字段（枚举值，非自由文本）
