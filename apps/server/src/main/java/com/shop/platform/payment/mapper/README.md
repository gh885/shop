# payment/mapper — 表结构与字段字典

> 这个目录只放 SQL。状态机、回调处理、重试任务在 `service/`，渠道协议在 `internal/`，
> 表为什么这么设计（账本分层、挂账与 clearing 的分工）在 [ledger.md](../../../../../../../../../../docs/domain/ledger.md)。

schema `payment` 共 3 张表，全是**钱的事实**。这个模块不做金额推导——应付金额由 `trade`
算好传进来，这里只认「渠道说钱到了」和「我们把钱退了」两件事。

几条全局约定，读下面任何一张表都要先记住：

- 不建外键。`payment_id`、`order_group_id` 这些指向关系由代码保证，跨 schema 更不 JOIN。
- 金额一律 `bigint`，单位**分**。没有浮点，没有裸 int64 参与计算（渠道侧的分↔元换算在
  `AlipayChannel`，字符串解析，绝不走 double）。
- 状态、枚举列存**枚举名的小写**（`'pending'`、`'late_callback'`）。`DbEnumTypeHandler`
  靠这条约定反解成 `PaymentStatus` / `SuspenseReason`，不守约定的值会在映射时抛异常，不会静默错值。
- 时间列一律 `timestamptz`。
- **三张表都没有 `updated_at`。** 支付单是"结果只会被事实推进"的单据，每次推进都带状态前置条件，
  历史都看得到（`paid_at` / `closed_at` / `resolved_at`），一个会漂的 `updated_at` 不增加信息。
- **所有状态迁移都是条件更新**（`WHERE ... AND status = 'old'`）。影响 0 行不是异常，是判决：
  回调重放、订单已关、另一个消费者先退了——调用方必须把它当正常分支，不能吞也不能重试。

## 表一览

| 表               | 一句话                                     | 谁在写               |
| ---------------- | ------------------------------------------ | -------------------- |
| `payment_order`  | 支付单；一组订单可多张（重试），只一张成功 | `PaymentOrderMapper` |
| `refund_order`   | 退款单；一笔业务退款一行                   | `RefundOrderMapper`  |
| `suspense_entry` | 挂账待查：钱到了但推进不了                 | `SuspenseMapper`     |

---

## payment.payment_order

**支付单。** 一个订单组可以有多张（支付失败重试），同一时刻只有一张能走到 `success`。

| 字段              | 类型        | 空 / 默认                  | 说明                                                                                                    |
| ----------------- | ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`              | uuid        | PK，默认 `uuidv7()`        | 支付单 id                                                                                               |
| `pay_no`          | text        | NOT NULL，唯一             | 内部支付单号                                                                                            |
| `buyer_id`        | uuid        | NOT NULL                   | 谁付的                                                                                                  |
| `order_group_id`  | uuid        | NOT NULL                   | 属于哪个订单组。重试会为同一组建多张                                                                    |
| `channel`         | text        | NOT NULL                   | `alipay` / `wechat` / `mock`（`ck_payment_channel`）                                                    |
| `out_trade_no`    | text        | NOT NULL，唯一             | 发给渠道的商户订单号。**回跳只带它**，回调里的 `trade_status` / `total_amount` 等参数一律当作不可信输入 |
| `amount`          | bigint      | NOT NULL                   | 订单应付，分                                                                                            |
| `expected_amount` | bigint      | NOT NULL                   | 我们期望渠道收的钱，分。回调时和实收比对，算一次 `matched`                                              |
| `currency`        | char(3)     | NOT NULL，默认 `'CNY'`     | 币种                                                                                                    |
| `status`          | text        | NOT NULL，默认 `'pending'` | `pending` / `success` / `failed` / `closed` / `refunded`（`ck_payment_status`）                         |
| `matched`         | boolean     | 可空                       | 回调金额与应付是否一致。`false` 时 trade 拒收、整组进挂账。由我们算一次，不让 trade / clearing 各算一遍 |
| `channel_txn_id`  | text        | 可空，唯一                 | 渠道流水号。**重放的回调撞这条唯一索引**，不重复记账                                                    |
| `channel_payload` | jsonb       | 可空                       | 渠道原始回调报文。只查不改，出问题时唯一能还原的东西                                                    |
| `paid_at`         | timestamptz | 可空                       | 成功时刻，`markSuccess` 里写 `now()`                                                                    |
| `closed_at`       | timestamptz | 可空                       | 超时关单时刻                                                                                            |
| `expire_at`       | timestamptz | NOT NULL                   | 有效期 = min(自身 30 分钟, 订单关单宽限)，同步传 `time_expire` 给渠道                                   |
| `created_at`      | timestamptz | NOT NULL，默认 `now()`     | 创建时间                                                                                                |

约束：`uq_payment_pay_no`、`uq_payment_out_trade_no`、`uq_payment_channel_txn`、
`ck_payment_amount`（两个金额都 ≥ 0）、`ck_payment_status`、`ck_payment_channel`。

索引：`idx_payment_order_group (order_group_id)`、`idx_payment_order_buyer (buyer_id, created_at DESC)`，以及
`idx_payment_pending_expire (expire_at) WHERE status = 'pending'`——超时关单只扫这个部分索引。

**状态机与幂等**：

```
pending ──markSuccess──→ success
   │  └──markFailed──→ failed
   └──closeExpiredBatch──→ closed
```

三条出口全是 CAS，且和回调共用前置条件 `status = 'pending'`：谁改到行谁赢。重放的回调影响 0 行直接跳过，
所以幂等不靠代码先查"付过没有"——那个判断在并发下一定会漏。

**超时关单是批量的一条语句**（`closeExpiredBatch`）：里层子查询用
`FOR UPDATE SKIP LOCKED` 圈定到期单并直接关闭。以前是"先查 500 条、再逐条 UPDATE"，
500 个来回全在一个事务里。`SKIP LOCKED` 让多实例互不抢行，`FOR UPDATE` 挡住并发回调同时改这些行。

## payment.refund_order

**退款单，一笔业务退款一行。** 幂等键是 `(payment_id, seller_order_id, reason)`，由表达式
唯一索引 `uq_refund_suspense_biz` 兜：同一个售后单重复发 `ReturnApproved`，第二发
`ON CONFLICT DO NOTHING` 什么都不做——不靠代码判断"退过没有"。

| 字段                | 类型        | 空 / 默认                  | 说明                                                                                 |
| ------------------- | ----------- | -------------------------- | ------------------------------------------------------------------------------------ |
| `id`                | uuid        | PK，默认 `uuidv7()`        | 退款单 id                                                                            |
| `refund_no`         | text        | NOT NULL，唯一             | 内部退款单号                                                                         |
| `payment_id`        | uuid        | NOT NULL                   | 从哪张支付单退（原路退款的依据）                                                     |
| `order_group_id`    | uuid        | NOT NULL                   | 订单组，冗余存一份避免回头查                                                         |
| `seller_order_id`   | uuid        | 可空                       | 部分退款按子单退；**挂账退款没有子单，为 NULL**。带上它才能和 RefundRequested 对齐   |
| `amount`            | bigint      | NOT NULL                   | 退款金额，分（`ck_refund_amount` 保证 > 0）                                          |
| `currency`          | char(3)     | NOT NULL，默认 `'CNY'`     | 币种                                                                                 |
| `reason`            | text        | NOT NULL                   | 退款原因，幂等键的一部分                                                             |
| `status`            | text        | NOT NULL，默认 `'pending'` | `pending` / `success` / `failed`（`ck_refund_status`）                               |
| `channel_refund_id` | text        | 可空                       | 渠道受理后的退款流水号，`markSuccess` 时写                                           |
| `attempts`          | integer     | NOT NULL，默认 `0`         | 渠道尝试次数（含首试后的每次重试）。**超上限状态不变**，留给人工——日志和扫描都看得见 |
| `completed_at`      | timestamptz | 可空                       | 成功时刻                                                                             |
| `created_at`        | timestamptz | NOT NULL，默认 `now()`     | 创建时间                                                                             |

约束：`uq_refund_no`、`ck_refund_amount`、`ck_refund_status`、`ck_refund_attempts`。

索引：`idx_refund_order_group`、`idx_refund_payment`，以及
`idx_refund_pending_retry (created_at) WHERE status = 'pending'`——重试扫描只走这个部分索引。

**幂等去重只有一条表达式唯一索引**（`V20261025100000` 建；`V20261025220000` 删掉了被它
完全覆盖的普通唯一约束 `uq_refund_biz`）：
`uq_refund_suspense_biz (payment_id, COALESCE(seller_order_id, '00000000-…'::uuid), reason)`。
COALESCE 把挂账退款的 NULL 子单折成零 uuid——普通唯一索引的 `=` 比较拦不住 NULL 的重复
（NULL ≠ NULL），挂账就会重复退。`RefundOrderMapper.insert` 的 `ON CONFLICT` 指到的就是它。

**重试语义**：`findStalePending` 按 `created_at <= olderThan AND attempts < maxAttempts` 圈出
渠道没受理的单子；`incrementAttempts` 用 `UPDATE ... RETURNING attempts` 一步加一并返回新值，
不存在的单子在 default 方法里抛 `IllegalStateException`。**超上限的判断交给调用方，SQL 里不藏策略。**

## payment.suspense_entry

**挂账待查：钱到了但订单推进不了的统一台账**，替换之前三处各写各的日志——日志是没人会去看的东西。
三条路径共用一张表：

| reason            | 场景                                                 |
| ----------------- | ---------------------------------------------------- |
| `late_callback`   | 支付单已关/已失败后渠道才报成功——钱在渠道手里        |
| `amount_mismatch` | 钱到了但金额和应付对不上                             |
| `order_closed`    | 支付成功但订单已被超时关单/取消，`markPaid` 输了竞态 |

| 字段             | 类型        | 空 / 默认               | 说明                                                                    |
| ---------------- | ----------- | ----------------------- | ----------------------------------------------------------------------- |
| `id`             | uuid        | PK，默认 `uuidv7()`     | 挂账行 id。由库默认值生成，调用方不关心，只关心"挂上了"                 |
| `payment_id`     | uuid        | NOT NULL                | 哪张支付单                                                              |
| `order_group_id` | uuid        | NOT NULL                | 哪个订单组，冗余存一份                                                  |
| `reason`         | text        | NOT NULL                | 三选一（`ck_suspense_reason`）                                          |
| `channel`        | text        | NOT NULL                | 渠道                                                                    |
| `channel_txn_id` | text        | 可空                    | 渠道流水号。回调路径取报文里的，命令路径取支付单上的                    |
| `amount`         | bigint      | NOT NULL                | 渠道实收（或输掉竞态时的实付），分（`ck_suspense_amount` 保证 > 0）     |
| `currency`       | char(3)     | NOT NULL，默认 `'CNY'`  | 币种                                                                    |
| `raw_payload`    | jsonb       | 可空                    | 渠道原始回调报文（迟到回调路径才有），出问题时唯一能还原的东西          |
| `status`         | text        | NOT NULL，默认 `'open'` | `open` / `resolved`（`ck_suspense_status`）                             |
| `resolution`     | text        | 可空                    | `refunded`（已原路退款）/ `dismissed`（人工驳回：不是真钱或已线下处理） |
| `note`           | text        | 可空                    | 人工处理备注                                                            |
| `created_at`     | timestamptz | NOT NULL，默认 `now()`  | 挂账时刻                                                                |
| `resolved_at`    | timestamptz | 可空                    | 销账时刻                                                                |

约束：`uq_suspense_payment_reason (payment_id, reason)`——**同一件事只挂一条**，渠道重投回调、
事件重放都不该把同一笔钱挂两次；`ck_suspense_lifecycle`——销账三件套同生同死：
`(status = 'open') = (resolution IS NULL AND resolved_at IS NULL)`，open 时不许有 resolution，
resolved 时必须有。

索引：`idx_suspense_open (created_at) WHERE status = 'open'`——清单只关心 open 的，处理速度靠它。

**登记有两条路，证据不一样**（`SuspenseMapper` 的两个 default `insert`）：

- 回调路径：渠道报的事实（金额、流水号、原始报文）就是证据，原样落
- 命令路径（trade 输掉竞态后调）：报文没有，支付单上的渠道流水号就是证据，`raw_payload` 为 null

**销账两个出口**：管理端人工单条 `resolve`（open → resolved，前置条件就是幂等闸门，
false 调用方据此 409）；退款成功后 `resolveRefundedByPayment` 按支付单批量销——
一张支付单最多挂一条（三原因互斥），open 的全销。

## 别把两层 suspense 混为一谈

`payment.suspense_entry` 是**运维侧的待查队列**（+管理端退款/驳回入口）；
账本层的 suspense 分录（`clearing` 按 `matched` 分流记账）是另一层设计，见 ledger.md。
这张表回答"这笔钱怎么办"，账本回答"这笔钱怎么记"。

---

## 每个 mapper 碰哪些表 / 列

| 类                   | 操作   | 表               | 说明                                                                       |
| -------------------- | ------ | ---------------- | -------------------------------------------------------------------------- |
| `PaymentOrderMapper` | INSERT | `payment_order`  | 建单（pending），`expire_at` 由调用方算好传入                              |
| `PaymentOrderMapper` | SELECT | `payment_order`  | 按 id / `out_trade_no` / `order_group_id` 点查                             |
| `PaymentOrderMapper` | UPDATE | `payment_order`  | `markSuccess`（写 matched、channel_txn_id、channel_payload、paid_at）      |
| `PaymentOrderMapper` | UPDATE | `payment_order`  | `markFailed`（写 channel_payload）                                         |
| `PaymentOrderMapper` | UPDATE | `payment_order`  | `closeExpiredBatch`（部分索引圈单，FOR UPDATE SKIP LOCKED）                |
| `RefundOrderMapper`  | INSERT | `refund_order`   | `ON CONFLICT` 走表达式唯一索引，重复即静默                                 |
| `RefundOrderMapper`  | SELECT | `refund_order`   | 按业务键点查：有子单用 `=`，挂账退款必须用 `IS NULL`（两个方法）           |
| `RefundOrderMapper`  | UPDATE | `refund_order`   | `markSuccess`（CAS pending → success）；`incrementAttempts`（RETURNING）   |
| `RefundOrderMapper`  | SELECT | `refund_order`   | `findStalePending`（部分索引 + attempts 上限交给调用方判）                 |
| `SuspenseMapper`     | INSERT | `suspense_entry` | 两条登记路径；`ON CONFLICT (payment_id, reason) DO NOTHING`                |
| `SuspenseMapper`     | SELECT | `suspense_entry` | 按 id 点查 + 管理端清单（open 在前，组内新的在前，限 200 条）              |
| `SuspenseMapper`     | UPDATE | `suspense_entry` | `resolve`（人工单条，false → 409）；`resolveRefundedByPayment`（按单全销） |

## 读这张表时的一个坑

- **`seller_order_id IS NULL` 的查询不能写成 `= NULL`，幂等去重只有表达式索引一条路。**
  挂账退款没有子单，普通唯一索引的等值比较对 NULL 行永远不成立；去重靠
  `uq_refund_suspense_biz` 表达式索引，查询靠 `findBySuspenseReason` 里显式的 `IS NULL`。
  少了任何一个，挂账退款就会重复退。
