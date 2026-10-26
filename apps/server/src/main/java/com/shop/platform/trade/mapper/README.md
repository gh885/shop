# trade/mapper — 表结构与字段字典

> 这个目录只放 SQL。下单编排、超时关单、幂等在 `service/`，三层怎么拆、金额怎么摊在
> [order-model.md](../../../../../../../../../../docs/domain/order-model.md)。

schema `trade` 共 5 张表，是**订单三层**：`order_group`（支付 + 关闭）/ `seller_order`（履约 + 结算）/
`order_line`（快照 + 计数器），外加优惠分摊证据表和状态流水表。

几条全局约定，读下面任何一张表都要先记住：

- 不建外键。`quote_id`、`group_id`、`seller_order_id` 这些指向关系由代码保证，跨 schema 更不 JOIN。
- 金额一律 `bigint`，单位**分**。没有浮点，没有裸 int64。
- 状态列存**枚举名的小写**（`'unpaid'`、`'partial_shipped'`）。`DbEnumTypeHandler` 靠这条约定
  反解成 `PaymentStatus` / `CloseReason`，不守约定的值会在映射时抛异常，不会静默错值。
- 时间列一律 `timestamptz`。
- **四张表都没有 `updated_at`。** 状态是算出来 / CAS 出来的，时间线索看 `paid_at` / `closed_at` /
  `order_event` 流水，一个会漂的 `updated_at` 不增加信息。
- **计数器靠 CAS 更新，快照列只插不改。** 所有条件更新影响 0 行都是判决：别人先动了、
  超了上限——调用方必须当正常分支，不能吞也不能重试。

## 表一览

| 表                    | 一句话                                             | 谁在写              |
| --------------------- | -------------------------------------------------- | ------------------- |
| `order_group`         | 一次结算 = 支付单位；只有支付和关闭两个维度        | `OrderGroupMapper`  |
| `seller_order`        | 按商家拆 = 结算 + 发货 + 售后判责单位              | `SellerOrderMapper` |
| `order_line`          | 行快照 + 计数器，行永不删除                        | `OrderLineMapper`   |
| `order_line_discount` | 优惠分摊证据，从报价单原样拷来                     | `OrderLineMapper`   |
| `order_event`         | 每次状态变更一行，只追加（触发器拦 UPDATE/DELETE） | `OrderEventMapper`  |

读路径是 `BuyerOrderReadMapper`（买家侧读模型），下面单独说。

---

## trade.order_group

**支付单位。** 只有支付和关闭两个维度，**没有履约状态**——履约在子单上。

| 字段               | 类型        | 空 / 默认                 | 说明                                                                               |
| ------------------ | ----------- | ------------------------- | ---------------------------------------------------------------------------------- |
| `id`               | uuid        | PK，默认 `uuidv7()`       | 订单组 id                                                                          |
| `group_no`         | text        | NOT NULL，唯一            | 内部单号                                                                           |
| `buyer_id`         | uuid        | NOT NULL                  | 买家。**归属列，买家侧查询必须绑它**（`DataScopeTest` 守）                         |
| `quote_id`         | uuid        | NOT NULL，唯一            | 用了哪张报价单。`uq_order_group_quote` 保证**一张报价只能下一次单**                |
| `payment_status`   | text        | NOT NULL，默认 `'unpaid'` | `unpaid` / `paid` / `partially_refunded` / `refunded`（`ck_group_status`）         |
| `closed_at`        | timestamptz | 可空                      | **关闭是独立维度，不是 payment_status 的值**。未付款取消不用退钱，已付款关闭要冲正 |
| `closed_reason`    | text        | 可空                      | 与 `closed_at` 同生同死（`ck_group_close`）                                        |
| `currency`         | char(3)     | NOT NULL，默认 `'CNY'`    | 币种                                                                               |
| `goods_amount`     | bigint      | NOT NULL                  | Σ 行 subtotal                                                                      |
| `discount_amount`  | bigint      | NOT NULL                  | Σ 行优惠                                                                           |
| `shipping_amount`  | bigint      | NOT NULL                  | 运费                                                                               |
| `payable_amount`   | bigint      | NOT NULL                  | `goods - discount + shipping`（`ck_group_amount` 钉死）                            |
| `paid_amount`      | bigint      | NOT NULL，默认 `0`        | 实收。`ck_group_paid` 保证 ≤ payable_amount                                        |
| `refunded_amount`  | bigint      | NOT NULL，默认 `0`        | 已退。`ck_group_paid` 保证 ≤ paid_amount                                           |
| `shipping_address` | jsonb       | NOT NULL                  | 下单快照，只读。**子单上那份才是当前生效地址**，发货读子单的                       |
| `expires_at`       | timestamptz | NOT NULL                  | 支付有效期                                                                         |
| `paid_at`          | timestamptz | 可空                      | `markPaid` 里写 `now()`                                                            |
| `created_at`       | timestamptz | NOT NULL，默认 `now()`    | 创建时间                                                                           |
| `idempotency_key`  | text        | 可空                      | 客户端下单幂等键。`uq_order_group_idem (buyer_id, idempotency_key)` 部分唯一索引   |

约束：`uq_order_group_no`、`uq_order_group_quote`、`ck_group_amount`、`ck_group_status`、
`ck_group_close`、`ck_group_paid`、`ck_group_nonneg`，以及
`ck_group_paid_close`——**已付款订单的关闭只能走 `refunded` / `platform_forced`**，
不许直接写 `closed_at` 就完事。这条是库级的，绕过 API 直接写 SQL 也拦得住。

索引：`idx_order_group_buyer (buyer_id, created_at DESC)` 服务买家列表；
`idx_order_group_unpaid_expire (expires_at) WHERE payment_status = 'unpaid' AND closed_at IS NULL`——
超时任务只扫这个部分索引。

**下单幂等是锁 + 索引两层**（`OrderGroupMapper.lockIdempotency` / `findByIdempotencyKey`）：
入口先拿事务级 advisory lock（`pg_advisory_xact_lock(hashtext(key))`，提交或回滚自动释放），
同键的并发请求被串起来，后到的等先到的提交后一查就命中、返回先到的订单。
唯一索引 `uq_order_group_idem` 是锁丢了之后的最后一道闸。
没有这套，客户端网络超时重试、双击都能对同一车货下两单——以前防重只靠"一张报价一单"，
重新试算拿到新 `quote_id` 就绕过去了。

**状态迁移全是 CAS，胜负在 `payment_status = 'unpaid' AND closed_at IS NULL` 这一行上判**：

- `markPaid`（支付成功）和 `close`（超时关单）前置条件**完全一样**——支付回调和超时任务
  谁改到行谁赢，输了的拿 0 行自己走分支
- `addRefunded` 的状态是**算出来的**，不是调用方传的：`refunded >= paid` 就是全额退完。
  让调用方传状态，等于允许它写一个和金额对不上的状态

## trade.seller_order

**结算 + 发货 + 售后判责单位。一个商家一笔子单。**

| 字段                              | 类型        | 空 / 默认                    | 说明                                                                                                                                |
| --------------------------------- | ----------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`                              | uuid        | PK，默认 `uuidv7()`          | 子单 id                                                                                                                             |
| `order_no`                        | text        | NOT NULL，唯一               | 子单号                                                                                                                              |
| `group_id`                        | uuid        | NOT NULL                     | 属于哪个订单组                                                                                                                      |
| `merchant_id`                     | uuid        | NOT NULL                     | 商家。**归属列，卖家侧查询必须绑它**                                                                                                |
| `shop_id`                         | uuid        | NOT NULL                     | 店铺                                                                                                                                |
| `currency`                        | char(3)     | NOT NULL，默认 `'CNY'`       | 币种                                                                                                                                |
| `goods_amount` … `payable_amount` | bigint      | NOT NULL                     | 子单四项金额，`ck_seller_amount` 钉死恒等式，同 group                                                                               |
| `fulfillment_status`              | text        | NOT NULL，默认 `'unshipped'` | `unshipped` / `partial_shipped` / `shipped` / `received`（`ck_seller_status`）                                                      |
| `closed_reason`                   | text        | 可空                         | 与 `closed_at` 同生同死（`ck_seller_close`）。`platform_forced` **不在子单合法值里**，`SellerOrderMapper.close` 的 default 方法先拦 |
| `closed_at`                       | timestamptz | 可空                         | 关闭时刻。CAS：`WHERE closed_at IS NULL`，0 行 = 已被抢先关闭                                                                       |
| `shipping_address`                | jsonb       | NOT NULL                     | **当前生效地址**，发货读它。group 上那份是下单快照                                                                                  |
| `created_at`                      | timestamptz | NOT NULL，默认 `now()`       | 创建时间                                                                                                                            |

约束：`uq_seller_order_no`、`ck_seller_amount`、`ck_seller_status`、`ck_seller_close`。

索引：`idx_seller_order_merchant (merchant_id, created_at DESC)`、`idx_seller_order_group (group_id)`。

**不存 `shipped_qty`。** 那个数从行计数器聚合出来，存两份必然对不上——所以履约状态也是
**重算的**（`recomputeFulfillment`）：每次包裹变化都从行计数器重新算一遍
（全收到 → `received`；全发出 → `shipped`；发了一部分 → `partial_shipped`；一件没发 → `unshipped`）。
**不许手动 set**，否则哪天包裹数据修了，子单状态就永远对不上。

## trade.order_line

**行快照 + 计数器。** 行永不删除。`line_no` **沿用报价单行号，不重新编号**——
分摊矩阵、售后、买家展示全靠它对位。

| 字段                                        | 类型             | 空 / 默认              | 说明                                                        |
| ------------------------------------------- | ---------------- | ---------------------- | ----------------------------------------------------------- |
| `id`                                        | uuid             | PK，默认 `uuidv7()`    | 行 id。下单时由调用方先生成，优惠分摊才挂得上               |
| `seller_order_id`                           | uuid             | NOT NULL，联合唯一     | 属于哪个子单                                                |
| `line_no`                                   | integer          | NOT NULL，联合唯一     | 行号（`uq_order_line (seller_order_id, line_no)`）          |
| `listing_id` / `sku_id` / `spu_id`          | uuid             | NOT NULL               | 买的什么                                                    |
| `currency`                                  | char(3)          | NOT NULL，默认 `'CNY'` | 币种                                                        |
| `quantity`                                  | integer          | NOT NULL               | 数量（`ck_line_qty` > 0）                                   |
| `unit_amount`                               | bigint           | NOT NULL               | 单价，分                                                    |
| `subtotal`                                  | bigint           | NOT NULL               | `unit_amount × quantity`（`ck_line_sub` 钉死）              |
| `discount_amount`                           | bigint           | NOT NULL               | 本行全部优惠（`ck_line_disc`：0 ≤ discount ≤ subtotal）     |
| `payable_amount`                            | bigint           | NOT NULL               | `subtotal - discount_amount`（`ck_line_pay`），**不含运费** |
| `shipped_qty`                               | integer          | NOT NULL，默认 `0`     | 计数器，可改                                                |
| `received_qty`                              | integer          | NOT NULL，默认 `0`     | 计数器，可改                                                |
| `refunded_qty`                              | integer          | NOT NULL，默认 `0`     | 计数器，可改                                                |
| `refunded_amount`                           | bigint           | NOT NULL，默认 `0`     | 计数器，可改                                                |
| `cancelled_qty` … `cancelled_amount`        | integer / bigint | NOT NULL，默认 `0`     | 取消四件套，`ck_line_cancel` 钉死它们之间的恒等式           |
| `title` / `image_url` / `spec_values`       | text / jsonb     | NOT NULL（url 可空）   | 商品快照，**写入后永不更新**。商品改名改图不影响历史订单    |
| `category_id` / `brand_id` / `identity_key` | uuid / text      | NOT NULL / 可空        | 类目、品牌、规格身份键快照，优惠筛选和售后认规格用          |
| `commission_rate_bp`                        | integer          | NOT NULL，默认 `0`     | 佣金费率快照，分账结算按它算                                |
| `rate_version`                              | text             | NOT NULL，默认 `'v1'`  | 费率版本，重算时能对上是哪一版                              |

约束：行金额恒等式由 `ck_line_sub` / `ck_line_pay` / `ck_line_disc` / `ck_line_cancel` 在库级钉死；
计数器上限由 `ck_line_cnt` 钉死（`shipped ≤ quantity`、`received ≤ shipped`、
`refunded_qty + cancelled_qty ≤ quantity`）；跨表的不变式（`Σ 行 = 子单`、`Σ 子单 = 组`）
靠核对任务，**别假装 CHECK 防住了**。

索引：`idx_order_line_seller_order (seller_order_id)`、`idx_order_line_sku (sku_id)`。

**三个 CAS 计数器更新，上限全在 where 里**（`OrderLineMapper`）：

- `addRefunded`：件数不超 `quantity`，金额（含已取消部分）不超 `payable_amount`。超了影响 0 行，
  调用方据此回滚——**先查再改的窗口就是退多的窗口**
- `addShipped`：`shipped + qty <= quantity - refunded_qty`。发超了就是超卖；
  已退的件不许再发——全额退款未发货的单，这里就是"钱货两得"的最后一道闸
- `addReceived`：签收不超已发货量

**"还剩多少能发"由 SQL 算**（`findShippable` 的 `remaining` 别名列），不让调用方自己减——
只有持有计数器的这一侧能做对。注意：`remaining` 必须是 SQL 里的别名列，不能靠 record 上的
计算属性——映射器按列名找值，找不到就抛异常，它不会去调你的方法。

## trade.order_line_discount

**优惠分摊的证据，从报价单分摊矩阵原样拷过来**，连 `rule_version` 一起钉住。
退款按它退，结算按 `bearer` 分科目。

| 字段            | 类型    | 空 / 默认              | 说明                                                             |
| --------------- | ------- | ---------------------- | ---------------------------------------------------------------- |
| `order_line_id` | uuid    | PK 之一                | 哪一行                                                           |
| `rule_id`       | uuid    | PK 之一                | 哪条规则                                                         |
| `rule_version`  | text    | NOT NULL               | 规则版本                                                         |
| `type`          | text    | NOT NULL               | 规则类型，展示用                                                 |
| `bearer`        | text    | NOT NULL               | `platform` / `merchant`（`ck_line_discount_bearer`），结算分科目 |
| `currency`      | char(3) | NOT NULL，默认 `'CNY'` | 币种                                                             |
| `amount`        | bigint  | NOT NULL               | 本行本条规则分到的金额（`ck_line_discount_amount` > 0）          |

主键：`(order_line_id, rule_id)`。金额分摊只写一次（下单同一事务），没有更新入口——
快照列只插不改。

## trade.order_event

**状态流水，每次变更一行，只追加不删**——`trg_order_event_append_only` 触发器
（`common.reject_mutation()`）在库级拦 UPDATE / DELETE。没有它，"这单为什么被关了"只能靠猜。

| 字段            | 类型        | 空 / 默认              | 说明                                                                                                             |
| --------------- | ----------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `event_key`     | text        | NOT NULL，唯一         | 幂等键：`{order_kind}:{order_id}:{dimension}:{source}`。撞唯一索引就是重复消费，`append` 返回 false 让调用方跳过 |
| `order_kind`    | text        | NOT NULL               | `group` / `seller_order` / `line`（`ck_order_event_kind`）                                                       |
| `order_id`      | uuid        | NOT NULL               | 哪个单                                                                                                           |
| `dimension`     | text        | NOT NULL               | `payment` / `fulfillment` / `close` / `aftersale` / `address`（`ck_order_event_dimension`）                      |
| `from_value`    | text        | 可空                   | 变更前的值                                                                                                       |
| `to_value`      | text        | NOT NULL               | 变更后的值                                                                                                       |
| `operator_type` | text        | NOT NULL               | `buyer` / `merchant` / `system` / `platform` / `channel`（`ck_order_event_actor`）                               |
| `operator_id`   | uuid        | 可空                   | 操作人。system / channel 为 null                                                                                 |
| `reason`        | text        | 可空                   | 为什么变                                                                                                         |
| `created_at`    | timestamptz | NOT NULL，默认 `now()` | 发生时刻                                                                                                         |

索引：`idx_order_event_order (order_kind, order_id, created_at)` 按单查流水。

---

## 买家读模型：`BuyerOrderReadMapper`

读不走写表 mapper，走这一个（归属列全在 SQL 里，service 折 404，没有「查出来再比对」的窗口）：

- **三次点查而不是一次大 JOIN**：订单组 → 子单 → 行。JOIN 会把订单组那几列复制 N 遍，
  一个五商家十行的单会传回 50 份地址 JSON；三次点查总代价更低，也更好读。
- **`displayStatus` 是算出来的**，一个 CASE 表达式三处复用（详情、列表、列表过滤）。
  顺序有意义：先判关闭（关了的单不管付没付钱都不该显示"待付款"），再判支付——
  反过来会造出"已取消 + 待付款"这种自相矛盾的展示。订单组没有履约状态，别在这里找"已发货"。
- **列表游标是行值比较** `(created_at, id) < (cursorAt, cursorId)`：只按 `created_at` 比较会串
  同一毫秒的行，`id` 是平局裁决。`limit` 传页大小 + 1，多取一条只为判断有没有下一页。
- 子单按 `group_id` 取、行按子单 id 批取的两条 Internal 方法：母单归属已在 `findGroup`
  验过，子查询不再绑列。

## 无归属点查（Internal）

`OrderGroupMapper.findInternal` / `findExpiredInternal`、`SellerOrderMapper.findInternal` /
`findByGroupInternal` 都是**无归属点查**，只给内部链路（支付回调、超时关单、发货写回、退款、
订单完成）用——它们自己持有已验证的归属上下文。买家侧读绑 `buyer_id`、卖家侧读绑
`merchant_id`，这条线由 `DataScopeTest` + `ArchitectureTest` 守（`Internal` 后缀豁免，
controller 调即红）。

---

## 每个 mapper 碰哪些表 / 列

| 类                     | 操作   | 表                                            | 说明                                                                                  |
| ---------------------- | ------ | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `OrderGroupMapper`     | INSERT | `order_group`                                 | 下单整行落库；状态列留库默认，insert 不碰状态                                         |
| `OrderGroupMapper`     | SELECT | `order_group`                                 | 幂等锁（advisory lock）+ 同键查 + Internal 点查 + 超时扫描                            |
| `OrderGroupMapper`     | UPDATE | `order_group`                                 | `markPaid` / `close`（同前置条件 CAS）、`addRefunded`（状态算出来）                   |
| `SellerOrderMapper`    | INSERT | `seller_order`                                | 下单整行落库；`fulfillment_status` 由重算维护，insert 不碰                            |
| `SellerOrderMapper`    | SELECT | `seller_order`                                | 按组取 + Internal 点查                                                                |
| `SellerOrderMapper`    | UPDATE | `seller_order`                                | `closeRow`（CAS `closed_at IS NULL`）、`recomputeFulfillment`（从行聚合）             |
| `OrderLineMapper`      | INSERT | `order_line` / `order_line_discount`          | 下单时写行与分摊；快照列只插不改                                                      |
| `OrderLineMapper`      | SELECT | `order_line`（+ JOIN 两表）                   | `lineRefsOf` 交 inventory；`findShippable`；`findRefundable` 两条路（按 id / 按行号） |
| `OrderLineMapper`      | UPDATE | `order_line`                                  | `addRefunded` / `addShipped` / `addReceived`，上限全在 where                          |
| `OrderEventMapper`     | INSERT | `order_event`                                 | `ON CONFLICT (event_key) DO NOTHING`，false = 重复消费                                |
| `BuyerOrderReadMapper` | SELECT | `order_group` / `seller_order` / `order_line` | 买家侧读模型，归属列进 SQL；三次点查，不做大 JOIN                                     |

## 读这些表时的三个坑

- **`seller_order.shipping_address` 是当前生效地址，`order_group.shipping_address` 是下单快照。**
  同名不同义，发货读子单那份，展示用组那份。
- **`order_line.payable_amount` 不含运费**，子单/组的 `payable_amount` 含。同名不同义，
  退款对账时最容易在这里差一个运费。
- **别手动改 `seller_order.fulfillment_status`。** 它是 `recomputeFulfillment` 从行计数器
  算出来的，手动 set 之后下一次包裹事件就会把它冲掉——想改状态，改计数器。
