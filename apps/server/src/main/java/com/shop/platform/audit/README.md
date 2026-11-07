# audit — 操作审计

```yaml
module: audit
layer: 平台能力
schema: audit
status: implemented
depends_on: []
emits: []
consumes: []
```

平台能力，但**它有自己的表，所以它是模块**。这是 module-map 第 8.3 节定的判据：其余六个平台能力
（authz / config / idgen / scheduler / gateway / observability）都进了 `common` 和 `infra` 共享包。

schema：`audit`。规则见 [ledger.md](../../../../../../../../../docs/domain/ledger.md) 第 10 节与
[database.md](../../../../../../../../../docs/domain/database.md) 的「只追加表」一节。

## 模块契约

| 方向 | 对象           | 内容                                                          |
| ---- | -------------- | ------------------------------------------------------------- |
| 输入 | —              | 不依赖任何业务模块，不消费事件（`emits: []`、`consumes: []`） |
| 输出 | `audit :: api` | `AuditCommand.record(AuditEntry)`：写操作留痕，带字段级前后值 |

**只被调用，不回调。** 审计是终点：不判断业务、不改业务数据、不发事件——所以它能做成同步调用而不成环，
依赖方向永远只有"业务 → audit"。

`api/` 里只有 `AuditCommand` 和两个值对象（`AuditEntry`、`FieldChange`）。实现类 `AuditRecorder` 住在
`service/`，调用方拿不到它——换实现（比如改成异步刷盘）不该惊动业务代码。

## 这里有什么

```
audit/
├── api/       AuditCommand（唯一写入口）、AuditEntry（一条待写记录）、FieldChange（字段前后值）
├── service/   AuditRecorder：清单校验 + 序列化
└── mapper/    AuditLogMapper：唯一的 SQL
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

**通了一条路，但只有一条。**

- 记录器、表、触发器、清单都在，测试也覆盖了「回滚时审计一起没」
- 七个模块在调（`account` / `catalog` / `governance` / `payment`（挂账退款与驳回）/ `promotion` / `seller` / `staff`）；`trade` / `returns` / `fulfillment` / `inventory` 的状态迁移不接——各自的只追加域日志（`order_event` / `case_log` / `stock_ledger`）已带操作人，再记是重复记账

两道强制检查（都在 `mvn test` 里，纯文本扫描不连库）：

- **`AuditActionVocabularyTest`**：注册表（迁移里的 INSERT − DELETE）⇄ 代码调用点双向对拍。
  注册了没人调（死码）与直调未注册（运行时必炸）都红灯。动作名可经变量透传给
  `AuditEntry.by*`，判死用宽口径（全仓 3 段小写字面量），直调用窄口径；
  变量透传的未注册场景由运行时清单校验兜底（响的，不是静默的）。
- **`AuditCoverageTest`**：`contracts/audit-coverage.yaml` 给六个动钱模块的每个写端点一个
  显式表态（`audit:` / `domain-log:` / `exempt:`），与 controller 双向对拍——新增写端点
  不先表态，门禁红；清单指向已删端点，同样红。「哪些接口必须审计」从此是清单里的一行字，
  不再是评审时的心算。
