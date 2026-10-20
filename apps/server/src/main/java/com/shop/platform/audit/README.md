# audit — 操作审计

平台能力，但**它有自己的表，所以它是模块**。这是 module-map 第 8.3 节定的判据：其余六个平台能力
（authz / config / idgen / scheduler / gateway / observability）都进了 `common` 和 `infra` 共享包。

schema：`audit`。规则见 [ledger.md](../../../../../docs/domain/ledger.md) 第 10 节与
[database.md](../../../../../docs/domain/database.md) 的「只追加表」一节。

## 这里有什么

```
audit/
├── model/     AuditEntry（一条待写记录）、FieldChange（字段前后值）
├── service/   AuditRecorder：清单校验 + 序列化
└── mapper/    AuditLogStore：唯一的 SQL
```

## 三条约束，各有实现

| 约束         | 靠什么                                                        |
| ------------ | ------------------------------------------------------------- |
| **清单驱动** | `action` 必须在 `audit.audit_action` 里登记，否则直接抛异常   |
| **同事务**   | 不另起 `REQUIRES_NEW`；业务回滚审计跟着没，业务提交审计一定在 |
| **只追加**   | 表上装了 `common.reject_mutation()` 触发器，属主也改不掉      |

清单驱动不是洁癖：一个拼错的动作名会让统计永久少一类，而且**不会报错**。宁可挡在开发期。

## 加一个审计动作的两步

1. 迁移里 `INSERT INTO audit.audit_action`（动作名用 `<模块>.<对象>.<过去式>`，如 `trade.order.price_changed`）
2. 业务代码里 `auditRecorder.record(AuditEntry.byStaff(...))`

漏了第 1 步会抛 `未登记的审计动作`，漏了第 2 步……见下。

## 为什么不用注解切面

切面只知道「方法被调用了」，拿不到字段的前后值；批量改 500 行时也只记一条。
审计要回答的是「哪条数据从什么变成了什么」，这只能由业务在改完之后把 diff 交出来。

## 闭环状态

**这个环是断的。**

- 记录器、表、触发器、清单都在，测试也覆盖了「回滚时审计一起没」
- 但**没有任何业务代码在调它**——目前唯一的调用方是测试

补上它要等第一个写业务。在那之前，这个模块处于「造好了没通电」的状态，
不能因为「审计做完了」就认为合规要求满足了。

另一个缺口：没有「哪些接口必须审计」的强制检查。现在漏调一个动作不会被任何东西发现。
