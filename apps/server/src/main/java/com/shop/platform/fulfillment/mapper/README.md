# fulfillment/mapper — 表结构与字段字典

> 这个目录只放 SQL。发货、签收、自动确认收货的任务编排在 `service/`，标准码状态机在 `model/`，
> 表为什么这么设计在 [fulfillment.md](../../../../../../../../../../docs/domain/fulfillment.md)。

schema `fulfillment` 共 3 张表。**包裹是唯一事实**：订单那边只存"发了几件"的计数器
（`trade.order_line.shipped_qty`），包裹和运单号全在这里。

几条全局约定，读下面任何一张表都要先记住：

- 不建外键。`seller_order_id`、`order_line_id` 这些指向关系由代码保证，跨 schema 更不 JOIN。
- 计数列没有，状态列存**枚举名的小写**（`'shipped'`、`'in_transit'`）。`DbEnumTypeHandler`
  靠这条约定反解成 `PackageStatus`，不守约定的值会在映射时抛异常，不会静默错值。
- 时间列一律 `timestamptz`。
- **三张表都没有 `updated_at`。** 状态单调只升不降，时间线索看 `shipped_at` / `delivered_at` /
  `overdue_at`，一个会漂的 `updated_at` 不增加信息。
- **所有状态迁移都是条件更新**（`WHERE ... AND status = ...`）。影响 0 行是判决，不是异常：
  轨迹乱序、回调重放、别的路径先推进了——调用方必须把它当正常分支。

## 表一览

| 表             | 一句话                                            | 谁在写           |
| -------------- | ------------------------------------------------- | ---------------- |
| `package`      | 包裹 = 履约的唯一事实；运单号、状态、时间线全在这 | `PackageMapper`  |
| `package_item` | 拆包的全部表达：一行两包或两行一包都是记录        | `PackageMapper`  |
| `ship_task`    | 承诺发货截止；`overdue` 不是终态                  | `ShipTaskMapper` |

轨迹流水住在 `logistics.trace_event`（logistics 模块自己的 mapper），这里只有 `package.last_trace_at`
一个汇总时间戳。

---

## fulfillment.package

**履约的唯一事实。** 拆包由商家决定，一个子单可以多个包裹，平台只要求每个包裹能追溯到订单行和数量。

| 字段               | 类型        | 空 / 默认                  | 说明                                                                                                                                                                                           |
| ------------------ | ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | uuid        | PK，默认 `uuidv7()`        | 包裹 id                                                                                                                                                                                        |
| `package_no`       | text        | NOT NULL，唯一             | 对外单号。**随机能力令牌：知道单号即有权查轨迹**（`findByPackageNoInternal`），不再叠归属列                                                                                                    |
| `seller_order_id`  | uuid        | NOT NULL                   | 属于哪个子单                                                                                                                                                                                   |
| `merchant_id`      | uuid        | NOT NULL                   | 商家。**归属列，卖家侧查询必须绑它**                                                                                                                                                           |
| `delivery_type`    | text        | NOT NULL，默认 `'express'` | 当前只有 `express`（`ck_package_type`）。虚拟履约等以后再加                                                                                                                                    |
| `carrier_code`     | text        | 可空                       | 承运商码，**存归一化后的小写**（`api/Carriers.normalize`），否则 `SF`/`sf` 会挂成两个承运商、同一运单能录两遍。`created` / `cancelled` 时可为空，其余状态必须非空                              |
| `tracking_no`      | text        | 可空                       | 运单号。**`uq_package_tracking` 保证同一运单号只挂一个包裹**——商家手误录两遍要当场被拒                                                                                                         |
| `status`           | text        | NOT NULL，默认 `'created'` | `created` → `shipped` → `in_transit` → `delivered` / `returned`；`cancelled`（`ck_package_status`）                                                                                            |
| `shipped_at`       | timestamptz | 可空                       | 发货时刻。当前 `PackageMapper.insert` 直接以 `'shipped'` 落库并写 `now()`                                                                                                                      |
| `delivered_at`     | timestamptz | 可空                       | 签收时刻。与状态同生同死：`ck_package_delivered` 强制 `(status='delivered') = (delivered_at 非空)`                                                                                             |
| `delivered_source` | text        | 可空                       | **谁确认的**：`buyer`（买家手点）/ `system`（到期自动确认）/ `trace`（承运商轨迹）。争议投诉"我没收到货订单就完成了"，答案在这列。与 `delivered_at` 同生共死（`ck_package_delivered_pairing`） |
| `last_trace_at`    | timestamptz | 可空                       | 最后一条轨迹时间，停滞检测靠它（还没接）。写入用 `GREATEST`，**乱序到达的旧轨迹拨不回去**。已经出现在 `PackageView.lastTraceAt` 里                                                             |
| `signed_by`        | text        | 可空                       | **谁签的字**，只有承运商轨迹能给。与 `delivered_source` 回答两个不同问题：那个说「谁确认的」，这个说「签收单上是谁的名字」。买家手点与到期自动确认永远为 null                                  |
| `created_at`       | timestamptz | NOT NULL，默认 `now()`     | 创建时间                                                                                                                                                                                       |

约束：`uq_package_no`、`ck_package_type`、`ck_package_status`、
`ck_package_tracking_required`（非 `created` / `cancelled` 必须有承运商 + 运单号）、
`ck_package_delivered`、`ck_package_delivered_source`（`buyer` / `system` / `trace` 三值，
`V20261025110000` 加前两值、`V20261025120000` 加 `trace`）、`ck_package_delivered_pairing`。

索引：`idx_package_seller_order (seller_order_id)`、`idx_package_merchant (merchant_id, created_at DESC)`、
`uq_package_tracking (carrier_code, tracking_no) WHERE tracking_no IS NOT NULL`——
**部分唯一索引**：PG 的 UNIQUE 默认把 NULL 当互不相等，而 `created` / `cancelled` 状态的包裹
恰好没有运单号，所以去重只对填了运单号的行生效；
`idx_package_auto_receive (shipped_at) WHERE status IN ('shipped', 'in_transit')`——
自动确认收货的扫描面，部分索引让 hourly 扫描不碰已签收/已取消的大多数。

**状态机与单调性**：

```
created ──→ shipped ──→ in_transit ──→ delivered
                 │           │
                 └───────────┴──→ returned      （拒收/退回）
```

状态单调只升不降，**这条靠代码，库只能钉住合法取值**：

- `markInTransit` 前置条件 `status = 'shipped'`——已是 `in_transit` / 终态的包裹影响 0 行，
  一条迟到的"揽收"退不回去
- `markDelivered` 前置条件 `status NOT IN (终态)`——**不写成 `= 'shipped'`**：包裹可能已经推进到
  `in_transit`，那时签收也必须成立；重放影响 0 行就是幂等闸门
- `markReturned` 同样挡终态
- `touchTrackAt` 记轨迹时间用 `GREATEST(COALESCE(...))`：乱序到达的旧轨迹不能把
  `last_trace_at` 拨回去。终态包裹也记——**delivered 之后收到的任何轨迹只记录不改状态**

**运单号定位是三条路径共用的**：买家"我的包裹到哪了"用 `package_no`（能力令牌即凭证），
承运商 webhook 用 `(carrier_code, tracking_no)`（走 `uq_package_tracking` 这把唯一索引），
两者都是 Internal 方法，归属由调用链自己负责。

## fulfillment.package_item

**拆包的全部表达。** 一行拆两包是两条记录，两行装一包也是两条记录——不另设"拆包方案"表。

| 字段            | 类型    | 空 / 默认     | 说明                       |
| --------------- | ------- | ------------- | -------------------------- |
| `package_id`    | uuid    | PK 之一       | 哪个包裹                   |
| `order_line_id` | uuid    | PK 之一       | 装的是哪一行（trade 的行） |
| `quantity`      | integer | NOT NULL，> 0 | 装了几件                   |

主键：`(package_id, order_line_id)`。索引：`idx_package_item_line (order_line_id)`
反查"这一行装进了哪些包裹"。

**不 JOIN `trade.order_line`。** 跨 schema 不 JOIN 是硬规则，而且那个 JOIN 会把 trade 的表结构
钉进 fulfillment 的 SQL 里。买家展示要的行号，由调用方通过 `TradeQuery` 补——那才是这两个模块
之间唯一允许的通道。

## fulfillment.ship_task

**承诺发货截止，一个商家单一条任务**（`uq_ship_task_order`）。发多个包裹不影响它，
第一个包裹发出就置 `shipped`。建任务在付款时（`createIfAbsent`，已存在就跳过）。

| 字段              | 类型        | 空 / 默认                  | 说明                                                                     |
| ----------------- | ----------- | -------------------------- | ------------------------------------------------------------------------ |
| `id`              | uuid        | PK，默认 `uuidv7()`        | 任务 id                                                                  |
| `seller_order_id` | uuid        | NOT NULL，唯一             | 哪个商家单                                                               |
| `merchant_id`     | uuid        | NOT NULL                   | 商家                                                                     |
| `due_at`          | timestamptz | NOT NULL                   | 承诺发货截止                                                             |
| `status`          | text        | NOT NULL，默认 `'pending'` | `pending` / `shipped` / `overdue` / `cancelled`（`ck_ship_task_status`） |
| `overdue_at`      | timestamptz | 可空                       | 判超时的时刻。置 `overdue` 时把线索报给 governance（违规线索）           |
| `created_at`      | timestamptz | NOT NULL，默认 `now()`     | 创建时间                                                                 |

约束：`uq_ship_task_order`、`ck_ship_task_status`。

索引：`idx_ship_task_due (due_at) WHERE status = 'pending'`——超时检测只扫这个部分索引。

**`overdue` 不是终态。** `markShipped` 的条件是 `status IN ('pending', 'overdue')`——
超时之后仍然可以发货，`overdue` 只表示曾经超过承诺时间，不是封杀。
`markOverdue` 的 CAS（`WHERE status = 'pending'`）保证 false = 已被别的路径推进
（发货了、取消了），本次不算超时。`cancel` 是不再需要履约的任务作废
（订单关闭、全额退款未发货），**不算超时**。

## 与 logistics 的分工

`logistics.trace_event`（原始轨迹 + 翻译后的标准码，只增不改）和
`logistics.carrier_code_map`（原始码 → 标准码，**建出来就是空的**——查不到映射一律 `unknown`，
绝不猜：猜错会把"退签"当"签收"直接触发结算，那是资损）住在 logistics 模块，
fulfillment 这边只有 `recordTrace` 幂等契约的消费侧：`uq_trace_natural (package_id, raw_code, occurred_at)`
让同一条轨迹推两遍只生效一次，冲突的那次连回写都不会被调。细节见 logistics 自己的文档。

---

## 每个 mapper 碰哪些表 / 列

| 类               | 操作   | 表             | 说明                                                                                                                         |
| ---------------- | ------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `PackageMapper`  | INSERT | `package`      | 直接以 `'shipped'` 落库 + `shipped_at = now()`                                                                               |
| `PackageMapper`  | INSERT | `package_item` | 每行一条，随包裹同一事务                                                                                                     |
| `PackageMapper`  | SELECT | `package`      | 按子单（绑 `merchant_id` 的卖家版 + Internal 版）、按单号、按运单号定位                                                      |
| `PackageMapper`  | UPDATE | `package`      | `markInTransit` / `markDelivered`（带 signedBy，`COALESCE` 不覆盖已有值）/ `markReturned`（CAS）/ `touchTrackAt`（GREATEST） |
| `PackageMapper`  | SELECT | `package`      | `findAutoReceivableInternal`（部分索引扫描面，`LIMIT #{limit}` 分批）                                                        |
| `PackageMapper`  | SELECT | `package_item` | 包裹里的行；**不 JOIN trade**，行号由调用方经 `TradeQuery` 补                                                                |
| `ShipTaskMapper` | INSERT | `ship_task`    | `createIfAbsent`（`ON CONFLICT (seller_order_id) DO NOTHING`，一单一任务）                                                   |
| `ShipTaskMapper` | UPDATE | `ship_task`    | `markShipped`（pending/overdue 都可）、`markOverdue`（CAS）、`cancel`                                                        |
| `ShipTaskMapper` | SELECT | `ship_task`    | `findPendingDue`（部分索引 + `LIMIT`，喂 ShipDeadlineJob）                                                                   |

## Internal 与归属

- `findBySellerOrder` **绑 `merchant_id`**，卖家侧查询走它；`findBySellerOrderInternal` /
  `findInternal` / `findByPackageNoInternal` / `findByTrackingNoInternal` 是**无归属点查**，
  只给已自行完成归属校验的内部链路（买家"包裹→子单→买家"链路校验、轨迹回写、webhook 定位）。
  这条线由 `DataScopeTest` + `ArchitectureTest` 守（`Internal` 后缀豁免，controller 调即红）。
- `package_no` 是特例：**随机能力令牌，知道单号即有权查**，本身是访问凭证，不再叠归属列。

## 读这些表时的两个坑

- **`package.insert` 直接落 `'shipped'`，不走 `created`。** 当前"商家填运单号发货"是唯一的建包
  路径，`created` 状态给以后的"商家备货中"留的；别把"created 包裹"当成当前业务存在的东西。
- **`delivered_source` 是三值不是两值。** `buyer` / `system`（自动确认收货）之外还有 `trace`
  （承运商轨迹签收），它和前两个一样与 `delivered_at` 同生共死——判争议时三种来源都要查。
