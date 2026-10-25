# 订单模型

> 回答 [questions.md](../questions.md) 第 40–49 题。落在 `trade` 模块，schema 同名。
> 模块 README 见 [trade](../../apps/server/src/main/java/com/shop/platform/trade/README.md)。

## 1. 一分钟稿

> 订单模型要回答一件事：钱、货、责，三样东西各自挂在哪一层。
>
> 三层：`order_group` 是买家眼里的"一个订单"，也是支付单位；`seller_order` 按商家拆，是结算、发货、售后判责的单位；`order_line` 挂 SKU、金额快照和优惠分摊。
>
> 最反直觉的一点：**订单组没有履约状态，只有支付状态。** 三个子单一个已签收、一个部分发货、一个售后中，订单组是哪个？说不清。所以发货进度只在子单上，买家看到的"部分发货"是算出来的展示态。
>
> 第二个点：**关闭是独立的一列，不是支付状态的一个值。** 未付款取消不用退钱，已付款关闭要记冲正，塞进同一个枚举就说不清了。
>
> 第三个点：**竞态不靠锁，靠条件更新。** 超时撤销和支付回调用的是同一个前置条件 `WHERE closed_at IS NULL AND payment_status = 'unpaid'`，谁改到行谁赢。

## 2. 模型与不变式

### 2.1 三层，两个正交维度

```
order_group      一次结算 = 支付单位，买家看到的"一个订单"
  └── seller_order   按商家拆 = 结算 + 发货 + 售后判责单位
        └── order_line   SKU + 数量 + 金额快照 + 优惠分摊
```

| 层             | 服务谁 | 承载                           |
| -------------- | ------ | ------------------------------ |
| `order_group`  | 买家   | 支付、优惠总额、收货地址、超时 |
| `seller_order` | 商家   | 结算基数、发货进度、售后范围   |
| `order_line`   | 商品   | 快照、分摊、退数量             |

**支付在 group 上，履约和结算在 seller_order 上，两个维度正交。** 硬把两者塞进一张表，跨店支付就表达不了。

**映射显式存。** `seller_order.group_id` 就是映射，不靠运行时按 `merchant_id` 分组推导——推导出来的映射会随拆单规则变化而漂移。

### 2.2 状态存维度，不存大枚举

只要出现"部分发货""部分退款"，单一枚举就崩。

| 维度                         | 挂在哪         | 取值                                                                                  | 谁能改                                     |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| `payment_status`             | `order_group`  | unpaid / paid / partially_refunded / refunded                                         | 渠道回调是事实源，`trade` 落库             |
| `closed_at`                  | `order_group`  | null / 时间戳                                                                         | 买家、系统、平台、退款回调（`trade` 落库） |
| `closed_reason`              | `order_group`  | null / buyer_cancelled / timeout / platform_forced / refunded / merchant_out_of_stock | 同上                                       |
| `fulfillment_status`         | `seller_order` | unshipped / partial_shipped / shipped / received                                      | 商家、物流回调                             |
| `seller_order.closed_reason` | `seller_order` | null / buyer_cancelled / timeout / refunded / merchant_out_of_stock                   | 买家、系统、商家、平台                     |
| 售后                         | `order_line`   | 由 `returns` 模块持有                                                                 | `returns`                                  |

**关闭是独立维度，不是 `payment_status` 的一个值。** 未付款取消不用退钱，已付款关闭要记冲正——塞进同一个枚举，付款状态就说不清了，而且 CAS 条件、展示态、事件触发者会各写一套。

`closed_at` 非空时，`payment_status` 仍保留它自己的值（`unpaid` 或 `paid`），用来回答"这单到底收过钱没有"。

`merchant_out_of_stock` 是现实里的高频路径：商家没货了，主动取消并退款。没有这个值，运营只能手填一个不准确的 `buyer_cancelled`。

### 2.3 展示态是推导的

买家看到的状态，全是这几个维度算出来的：

| 展示态     | 条件                                             |
| ---------- | ------------------------------------------------ |
| 待付款     | `payment_status = unpaid` 且 `closed_at IS NULL` |
| 待发货     | 已付、未关闭，所有行 `shipped_qty = 0`           |
| 部分发货   | 已付、未关闭，有行 `shipped_qty > 0` 且有行为 0  |
| 待收货     | 已付、未关闭，全部发完但未全部签收               |
| 交易完成   | 已付、未关闭，全部签收                           |
| 已取消     | `closed_at` 非空且 `payment_status = unpaid`     |
| 部分退款   | `payment_status = partially_refunded`            |
| 已退款     | `payment_status = refunded`                      |
| 退款处理中 | 存在未终态的退款单（`payment` / `returns` 提供） |
| 售后中     | 存在未终态的售后单（`returns` 提供）             |

后四个是叠加态，可以和前面的组合（"已发货 · 售后中"）。不存展示态，存了就有第二处真相。

### 2.4 每个迁移只有一个触发者

| 迁移                         | 唯一触发者                                                 |
| ---------------------------- | ---------------------------------------------------------- |
| 创建、确认收货、未付款时取消 | 买家                                                       |
| 付款成功                     | `trade` 收到 `PaymentSucceeded` 后执行——**不是买家点按钮** |
| 发货                         | 商家，且必须有运单号                                       |
| 签收                         | 物流轨迹回调，或超时自动确认                               |
| 超时关单、超时自动收货       | 系统                                                       |
| 强制关闭                     | 平台                                                       |

买家在支付成功页点"我已支付"不算数。**`payment` 不写 `trade` 的表**，它只发 `PaymentSucceeded`，由 `trade` 自己落状态。

### 2.5 快照就是订单行的列

原则：**订单里存"当时是什么"，不是"现在是什么"。**

| 必存                          | 为什么                           |
| ----------------------------- | -------------------------------- |
| 标题、主图、规格值            | 商品改名换图后订单页还能显示     |
| 单价、数量、行金额            | 商品改价后订单金额不变           |
| 优惠分摊（含规则 id、承担方） | 退款按分摊退，结算按承担方算基数 |
| 下单时的类目、品牌            | 费率是按类目算的                 |
| 费率 + 版本                   | 商家费率会变，老订单按老费率     |
| 完整收货地址                  | **发货依据，不能脱敏**           |
| `identity_key`                | 售后和比价要能认出是哪个规格     |

**运费不摊到行。** 行金额只有 `subtotal - discount`。运费挂在 `seller_order` 上，因为运费是按店铺算的（每个店一个运费模板），而且整单退才退运费，部分退不退。摊到行会让"退一件要不要退运费"变成无解的问题。

**`order_line.line_no` 直接沿用 `price_quote_line.line_no`，不在每个子单里重新编号。** 报价单的分摊矩阵和 `price_quote_rule.allocation` 都以报价单行号为 key，重编号会让 `order_line_discount` 对不上行。

脱敏做在展示层和导出层。快照里存脱敏电话，商家就发不了货。

**不钉**：库存数、最新价、评价、销量、包裹详情。包裹在 `fulfillment`，订单只存"发了几件"的计数器。

### 2.6 支付单和订单组是多对多

```
payment.payment  ←→  trade.order_group
```

- 支付失败重试 → 一个订单组多张支付单，只有一张成功
- 合并支付 → **一张支付单付多个订单组**

`order_group` 不存 `payment_id`，只存 `payment_status` 和 `paid_amount`。关联关系在 `payment` 侧。

### 2.7 八条不变式

1. **订单组只有支付维度和关闭维度。** 发货进度存在子单上，group 层不许出现履约状态。
2. **每个状态迁移只有一个触发者**，且都记 `order_event`。
3. **状态迁移只用条件更新。** 影响行数 = 0 就是别人先动了，不许先查后改。
4. **`order_line` 的快照列只插不改，行永不删除。** 状态和计数器（`shipped_qty` / `refunded_qty` 等）可以改，金额快照不许动。
5. **快照里的地址是完整可用的**，脱敏只在展示层。
6. **落单必须带 `quoteId`**，`order_group.quote_id` 唯一索引保证一张报价单只能用一次。
7. **金额恒等式**，逐层成立（取消的部分用 `cancelled_*` 扣掉）：

```
Σ (line.subtotal - line.cancelled_subtotal) = seller_order.goods_amount
Σ (line.discount_amount - line.cancelled_discount) = seller_order.discount_amount
Σ (line.payable_amount - line.cancelled_amount) = seller_order.goods_amount - seller_order.discount_amount
seller_order.payable_amount = goods_amount - discount_amount + shipping_amount
Σ seller_order.payable_amount = order_group.payable_amount
```

`cancelled_amount = cancelled_subtotal - cancelled_discount`，`cancelled_subtotal = unit_amount × cancelled_qty`。三者都必须在订单行上落成计数器，不能回头改快照列。

跨表约束 `CHECK` 写不出来，靠落单后跑核对任务。**别假装它已经防住了。**

8. **已支付订单的关闭只能走退款。** 不许直接把 `closed_at` 写上去。

## 3. 表与状态机

五张表。`order_group` `seller_order` `order_line` 是 module-map 列的三张，`order_line_discount` 和 `order_event` 是撑不住的地方。

### order_group

```sql
id              uuid PRIMARY KEY DEFAULT uuidv7(),
group_no        text NOT NULL UNIQUE,      -- BizNo，买家看到的号
buyer_id        uuid NOT NULL,
quote_id        uuid NOT NULL UNIQUE,      -- 幂等锚点
payment_status  text NOT NULL,             -- unpaid | paid | partially_refunded | refunded
closed_at       timestamptz,               -- 关闭是独立维度
closed_reason    text,                      -- buyer_cancelled | timeout | platform_forced | refunded | merchant_out_of_stock
currency        char(3) NOT NULL DEFAULT 'CNY',
goods_amount    bigint NOT NULL,
discount_amount bigint NOT NULL,
shipping_amount bigint NOT NULL,           -- Σ 子单运费
payable_amount  bigint NOT NULL,           -- goods - discount + shipping
paid_amount     bigint NOT NULL DEFAULT 0,
refunded_amount bigint NOT NULL DEFAULT 0,
shipping_address    jsonb NOT NULL,            -- 下单单时的快照，只读
expires_at       timestamptz NOT NULL,      -- 下单 + 30 分钟
paid_at         timestamptz,
created_at      timestamptz NOT NULL DEFAULT now(),
CONSTRAINT ck_group_amount CHECK (payable_amount = goods_amount - discount_amount + shipping_amount),
CONSTRAINT ck_group_status CHECK (payment_status IN ('unpaid','paid','partially_refunded','refunded')),
CONSTRAINT ck_group_close  CHECK (
    (closed_at IS NULL) = (closed_reason IS NULL)
    AND closed_reason IN ('buyer_cancelled','timeout','platform_forced','refunded','merchant_out_of_stock')
),
CONSTRAINT ck_group_paid   CHECK (
    paid_amount >= 0 AND paid_amount <= payable_amount
    AND refunded_amount >= 0 AND refunded_amount <= paid_amount
)
```

索引：`idx_order_group_buyer (buyer_id, created_at DESC)`。

超时任务用**部分索引**，不扫全表：

```sql
CREATE INDEX idx_order_group_unpaid_expire
    ON trade.order_group (expires_at)
    WHERE payment_status = 'unpaid' AND closed_at IS NULL;
```

### seller_order

```sql
id                 uuid PRIMARY KEY DEFAULT uuidv7(),
order_no           text NOT NULL UNIQUE,
group_id           uuid NOT NULL,
merchant_id        uuid NOT NULL,
shop_id            uuid NOT NULL,
currency           char(3) NOT NULL DEFAULT 'CNY',
goods_amount       bigint NOT NULL,
discount_amount    bigint NOT NULL,
shipping_amount    bigint NOT NULL,
payable_amount     bigint NOT NULL,
fulfillment_status text NOT NULL,          -- unshipped | partial_shipped | shipped | received
closed_reason      text,                   -- null | buyer_cancelled | timeout | refunded | merchant_out_of_stock
shipping_address       jsonb NOT NULL,         -- 当前生效地址，可被改地址覆盖
closed_at          timestamptz,
created_at         timestamptz NOT NULL DEFAULT now(),
CONSTRAINT ck_seller_amount CHECK (payable_amount = goods_amount - discount_amount + shipping_amount),
CONSTRAINT ck_seller_status CHECK (fulfillment_status IN ('unshipped','partial_shipped','shipped','received')),
CONSTRAINT ck_seller_close  CHECK (closed_reason IN
    ('buyer_cancelled','timeout','refunded','merchant_out_of_stock'))
```

索引：`idx_seller_order_merchant (merchant_id, created_at DESC)`、`idx_seller_order_group (group_id)`。

**子单不存 `shipped_qty` / `received_qty`。** 那两个数从行上聚合出来，存两份必然对不上。发几个包裹、发了几件，全看 `order_line` 的计数器。

`shipping_address` 在子单上也有一份，因为改地址是单个商家的事。**group 上那份是下单单时的快照，只读；子单上那份是当前生效地址，发货读它。**

### order_line

```sql
id               uuid PRIMARY KEY DEFAULT uuidv7(),
seller_order_id  uuid NOT NULL,
line_no          integer NOT NULL,
listing_id         uuid NOT NULL,
sku_id           uuid NOT NULL,
spu_id           uuid NOT NULL,
currency         char(3) NOT NULL DEFAULT 'CNY',
quantity         integer NOT NULL,
unit_amount      bigint NOT NULL,
subtotal         bigint NOT NULL,        -- unit × quantity
discount_amount  bigint NOT NULL,        -- 本行承担的优惠（不含运费）
payable_amount          bigint NOT NULL,        -- subtotal - discount_amount

-- 计数器：可改
shipped_qty      integer NOT NULL DEFAULT 0,
received_qty     integer NOT NULL DEFAULT 0,
refunded_qty     integer NOT NULL DEFAULT 0,
refunded_amount  bigint NOT NULL DEFAULT 0,
cancelled_qty    integer NOT NULL DEFAULT 0,   -- 未付款时部分取消
cancelled_subtotal bigint NOT NULL DEFAULT 0,  -- unit_amount × cancelled_qty
cancelled_discount bigint NOT NULL DEFAULT 0,  -- 取消数量分摊到的优惠
cancelled_amount bigint NOT NULL DEFAULT 0,    -- cancelled_subtotal - cancelled_discount

-- 以下全是快照列，写入后永不更新
title              text NOT NULL,
image_url          text,
spec_values        jsonb NOT NULL,
category_id        uuid NOT NULL,
brand_id           uuid,
identity_key       text,
commission_rate_bp integer NOT NULL,
rate_version       text NOT NULL,

UNIQUE (seller_order_id, line_no),
CONSTRAINT ck_line_qty  CHECK (quantity > 0),
CONSTRAINT ck_line_sub  CHECK (subtotal = unit_amount * quantity),
CONSTRAINT ck_line_pay  CHECK (payable_amount = subtotal - discount_amount AND payable_amount >= 0),
CONSTRAINT ck_line_disc CHECK (discount_amount >= 0 AND discount_amount <= subtotal),
CONSTRAINT ck_line_cancel CHECK (
    cancelled_subtotal = unit_amount * cancelled_qty
    AND cancelled_discount >= 0 AND cancelled_discount <= cancelled_subtotal
    AND cancelled_discount <= discount_amount
    AND cancelled_amount = cancelled_subtotal - cancelled_discount
    AND cancelled_amount <= payable_amount
),
CONSTRAINT ck_line_refund CHECK (
    refunded_amount >= 0 AND refunded_amount <= payable_amount
    AND cancelled_amount + refunded_amount <= payable_amount
),
CONSTRAINT ck_line_cnt  CHECK (
    shipped_qty >= 0 AND received_qty >= 0 AND refunded_qty >= 0 AND cancelled_qty >= 0
    AND shipped_qty <= quantity
    AND received_qty <= shipped_qty
    AND refunded_qty + cancelled_qty <= quantity
)
```

**行实付不含运费**，`payable_amount = subtotal - discount_amount`。运费在子单上，整单退才退。

**取消或部分退款按件分摊时，不重新跑算价。** 用 `pricing` 的最大余数法把 `line.payable_amount` 和 `line.discount_amount` 分别摊到件，取被取消/退回的那几件；`cancelled_discount` / `cancelled_amount` 由此得来。

`ck_line_sub` 和 `ck_line_pay` 是两条能在库层面钉死的恒等式，比写在文档里强。

快照列和流水列分两段写，就是为了让人一眼看出哪些能改、哪些不能。

### order_line_discount

```sql
order_line_id uuid NOT NULL,
rule_id       uuid NOT NULL,
rule_version  text NOT NULL,     -- 与 price_quote_rule.rule_version 一致
type          text NOT NULL,
bearer        text NOT NULL,     -- platform | merchant
currency      char(3) NOT NULL DEFAULT 'CNY',
amount        bigint NOT NULL,
PRIMARY KEY (order_line_id, rule_id),
CONSTRAINT ck_line_discount_amount CHECK (amount > 0)
```

从报价单的分摊矩阵原样拷过来，连 `rule_version` 一起钉住。退款按它退，结算按 `bearer` 分科目。

### order_event

```sql
id         uuid PRIMARY KEY DEFAULT uuidv7(),
event_key  text NOT NULL,     -- 幂等键：{order_kind}:{order_id}:{dimension}:{source_event_id 或 transition_no}
order_kind text NOT NULL,     -- group | seller_order | line
order_id   uuid NOT NULL,
dimension  text NOT NULL,     -- payment | fulfillment | close | aftersale | address
from_value text,
to_value   text NOT NULL,
operator_type text NOT NULL,     -- buyer | merchant | system | platform | channel
operator_id   uuid,
reason     text,
created_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT uq_order_event UNIQUE (event_key)
```

索引 `idx_order_event_order (order_kind, order_id, created_at)`。

挂 `common.reject_mutation()` 触发器，只追加。**每次状态变更一行**，没有它，"这单为什么被关了"只能靠猜。改地址也写一条 `dimension=address` 的事件，别只留业务日志。

### 部分取消

| 场景                 | 允许     | 怎么处理                                                                                         |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| 未付款，取消整单     | 是       | 各子单 `closed_reason`，再置组 `closed_at` / `closed_reason`，释放库存                           |
| 未付款，取消一个子单 | 是       | 子单 `closed_reason`，行写 `cancelled_qty` / `cancelled_*`，重算三层金额，释放对应库存           |
| 已付款，取消一个子单 | 是       | 走退款，子单 `closed_reason = refunded`；全额退完再置组 `closed_at` / `closed_reason = refunded` |
| 商家缺货取消         | 是       | 走退款，`closed_reason = merchant_out_of_stock`，上报 `governance`                               |
| 商家改价             | **不做** | 改价会让报价单失效，必须重新算价报价                                                             |
| 商家减运费           | **不做** | 同上                                                                                             |

**取消整单要写两个维度**：先子单 `closed_reason`、再组 `closed_at`，同一事务。只写组的话，子单还开着，买家页和商家页会显示两个状态。

**未付款部分取消会改变应付金额**，而这时可能已经有一张在途支付单。处理规则：

- 支付单还没发起支付 → 作废，按新金额重下
- 支付单已在渠道侧 → 不允许取消，提示买家先关掉支付
- 支付已成功但回调还没到 → 等回调，回调进来发现金额不符就整单退（见 §4）

改价不做，理由：**任何改价都会让 `quoteId` 的价格和最终成交价脱钩，算出两个真相。**

### 订单修改边界

| 阶段         | 改地址             | 改规格       | 拆单       |
| ------------ | ------------------ | ------------ | ---------- |
| 未付款       | 可以               | 只能取消重下 | 用户不能拆 |
| 已付款未发货 | 可以，重算运费差额 | 只能取消重下 | 用户不能拆 |
| 已发货       | 不可以，走售后     | 不可以       | —          |

已付款改地址产生的运费差额：**多退少补，走一笔独立退款或补款，不改原订单金额。** 原订单的快照一旦钉死就不动。

## 4. 关键时序

### 落单

```
买家点提交（带 quoteId + addressId）→ trade
  ├─ account::api 按 addressId 点查地址簿，校验归属本人（查无/不归本人同 404），展开成完整快照
  ├─ pricing 校验 quote：issued、未过期、fingerprint 一致（地址三段码参与指纹）
  │    不一致 → 返回 PRICE_CHANGED，让用户重新确认
  ├─ 同一事务：
  │    ├─ 调 pricing.consumeQuote(quoteId)（pricing 自己执行 issued→used CAS）
  │    ├─ 插入 order_group（quote_id 唯一索引再兜一层）
  │    ├─ 按 merchant_id 分组插入 seller_order
  │    ├─ 插入 order_line + 快照列 + order_line_discount
  │    ├─ inventory 预占（同步，事务内）
  │    └─ 发 SellerOrderPlaced（outbox，同事务落库）
  └─ 返回 group_no
```

**地址走 `addressId`，不走请求体内容。** 订单存的是展开后的完整快照（收件人、电话、国标区划码、省市区名称、详址）：编码给运费匹配和指纹，名称给买卖两侧展示。地址簿（account）是纯录入辅助——订单不引用 `address_id`，改地址、删地址都不影响历史订单；确认页要换地址就重新报价（指纹含地址，换了自然对不上）。

**`quote → used` 的 CAS 必须和插单在同一个事务。** 先置 `used` 再插单、插单失败就烧掉一张报价单；先插单再置 `used`，并发下两张单会拿到同一张报价。**这条命令由 `pricing` 提供，SQL 住在 `pricing` 的 mapper 里，`trade` 不直接写 `pricing` 的表。**

**库存必须同事务。** 异步化会造出"订单成立但没占到货"，直接超卖。

### 支付回调 vs 超时撤销

两边用**同一个前置条件**，谁改到行谁赢：

```sql
-- 超时任务（trade 自己的调度，不写别人的表）
UPDATE trade.order_group
   SET closed_at = now(), closed_reason = 'timeout'
 WHERE id = ? AND payment_status = 'unpaid' AND closed_at IS NULL;

-- trade 收到 PaymentSucceeded 之后
UPDATE trade.order_group
   SET payment_status = 'paid', paid_amount = ?, paid_at = ?
 WHERE id = ? AND payment_status = 'unpaid' AND closed_at IS NULL;
```

**`payment` 不写 `trade` 的表。** 它落自己的支付单，发 `PaymentSucceeded`，由 `trade` 执行上面这条 CAS。

影响行数就是胜负判决：

| 谁赢       | 另一边怎么办                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| 支付回调赢 | 超时任务影响 0 行，什么都不做，记日志                                                                      |
| 超时任务赢 | 回调影响 0 行 → `trade` 调 `PaymentCommand.suspend` 挂账（`order_closed`），钱由管理端挂账入口人工原路退款 |

**为什么挂账（`PaymentCommand.suspend`）而不是让 `payment` 自己发现：** 超时那一刻
`payment` 还不知道有这笔支付——回调是几秒后才到的。它不可能在消费 `OrderCancelled`
的时候预知未来。"钱到了但订单没了"这个事实必须由**先知道两件事的那一方**（`trade`）
登记。退款本身不自动做：挂账行进 `payment.suspense_entry`，管理端
（`/api/admin/payments/suspense`，权限 `SUSPENSE_MANAGE`）人工看一眼再退——
自动退款在金额对不上的场景里退错一次就是事故。

### 退款成功

`payment` 退完发 `RefundSucceeded`，`trade` 是订单侧的消费者：

```java
RefundSucceeded(refundId, paymentId, orderGroupId, sellerOrderId, amount: Money, refundedAt)  // → trade, clearing
```

```sql
-- 先加行计数器；同一 refundId 只能加一次，幂等键落在 order_event.event_key
UPDATE trade.order_line
   SET refunded_qty = refunded_qty + :qty,
       refunded_amount = refunded_amount + :line_amount
 WHERE id = :line_id;

-- 再加组金额，满额转 refunded，否则 partially_refunded
UPDATE trade.order_group
   SET refunded_amount = refunded_amount + :amount,
       payment_status = CASE
           WHEN refunded_amount + :amount >= paid_amount THEN 'refunded'
           ELSE 'partially_refunded'
       END,
       closed_at = CASE WHEN refunded_amount + :amount >= paid_amount THEN now() ELSE closed_at END,
       closed_reason = CASE WHEN refunded_amount + :amount >= paid_amount THEN 'refunded' ELSE closed_reason END
 WHERE id = :group_id
   AND payment_status IN ('paid','partially_refunded');
```

`RefundSucceeded` 必须带 `sellerOrderId`，否则部分退款时 `trade` 没法和 `RefundRequested` 对齐。子单全额退完后同时置 `seller_order.closed_reason = 'refunded'`；整组全额退完后 `closed_at` / `closed_reason = refunded` 一起落，展示态才是"已退款"而不是一直"退款处理中"。

### 预占被提前释放怎么办

极端情况：库存的兜底扫描把预占释放了（它的 grace 比订单超时还长，但可能因为人为操作提前跑），然后支付回调到了。

`commit` 预占影响 0 行时，不能当"已处理"跳过，必须看 `reservation.status`：

| 状态                   | 含义         | 动作                                        |
| ---------------------- | ------------ | ------------------------------------------- |
| `committed`            | 重复回调     | 跳过，幂等                                  |
| `consumed`             | 已经出库     | 跳过，幂等                                  |
| `released` / `expired` | **预占没了** | 重新预占；失败则发 `RefundRequested` + 告警 |

**已付款的订单必须有预占。** 没有预占就意味着货可能已经卖给别人了，这时唯一正确的动作是退款，不是硬着头皮发货。

### 超时任务的两条腿

```
延时队列（主）：落单时投一条 30 分钟后的消息
兜底扫表（备）：每 5 分钟扫部分索引，捞 expires_at < now() - 5min 的
```

两者走同一个 handler，handler 里就是上面那条 CAS。**兜底不是冗余**：消息丢了、队列重建、消费位点回退，都会让订单永远挂着。

扫表必须分批（每批 500）且只扫部分索引。

### 发货与签收

```
商家发货 → fulfillment 建包裹 → 回写 trade（api 命令，不是事件）
        → 更新 order_line.shipped_qty
        → 重算子单 fulfillment_status（未发 / 部分发 / 全发）

签收回调 → 回写 received_qty → 全签收则子单 received
        → 全部子单 received → 展示态变"交易完成"
        → 发 OrderCompleted → clearing 可以结算了
```

**聚合态是重算的，不是手动设的。** 每次包裹变化都从行计数器重算子单状态，再重算订单组展示态。

## 5. 失败模式与未决

### 会错在哪

| 现象                               | 根因                           | 怎么防                                                        |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| 订单既关闭又已支付                 | 没有 CAS，两边都写成功         | 同一条前置条件 + 影响行数判定                                 |
| 已付款却退了货回去，没货可发       | 预占被释放后 commit 当幂等跳过 | commit 影响 0 行时按 `reservation.status` 分流                |
| 库存被释放两次，超卖               | 撤销不幂等                     | 状态前置条件 + `order_event` 去重                             |
| 同一张报价单下两单                 | 前端重放、网络重试             | `quote_id` 唯一索引 + `issued→used` CAS                       |
| 三个子单状态打架，订单组显示不出来 | 存了 group 级履约状态          | group 只存支付和关闭                                          |
| 退款金额和原单对不上               | 退款时重新算价                 | 按 `order_line_discount` 快照退                               |
| 退款退多了整组                     | 事件里只带 groupId             | `RefundRequested` 必须带 `sellerOrderId` 和 `amount`          |
| 钱退了订单还是 `paid`              | `RefundSucceeded` 没接         | `trade` 按 `refundId` 幂等消费，更新 `refunded_amount` 和状态 |
| 商家拿不到电话，发不了货           | 快照里地址脱敏了               | 快照存完整地址，脱敏只在展示层                                |
| 订单行被 UPDATE，快照被改          | 图省事直接更新                 | 快照列只插不改，退款走计数器                                  |
| 子单上的发货数和行对不上           | 计数器存了两份                 | 子单不存计数器，全部从行聚合                                  |
| 刚下的单在列表里搜不到             | 列表走了搜索引擎               | 买家/商家列表走主库                                           |
| 订单永远挂着不关闭                 | 延时消息丢了、没兜底           | 兜底扫表扫描表部分索引                                        |

### 还没想清

- **多地址下单。** 一次结算一个地址，不同商家不能发往不同地址。会让订单组地址从一个变成多个，牵动运费重算。
- **合并退款。** 一张支付单付了三个订单组，退其中一个时渠道侧怎么退，要等 `payment` 那份文档定。
- **评价挂哪。** 现在挂在 `order_line` 上，但"整单评价"和"按行评价"是两种产品形态。
- **超时时间要不要按类目配。** 虚拟商品、预售的付款期限不一样，现在全平台 30 分钟。

### 分片键现在只是预留

`buyer_id` 和 `merchant_id` 都标了分片键，但**现在是单库，两个键都不生效**。

真分片时不能按它们分：落单要在同一事务里插 group + seller_order + line，父子落在不同分片就没法一个事务。正确做法是三层共用 `group_id` 的哈希，买家侧和商家侧各建一张异构索引表（见 [database.md](database.md) 第 6 节）。

现在写清楚，是为了防止有人真按 `buyer_id` 去分。

---

## 实现契约

- **表**：5 张，见 §3
- **库约束**：`ck_group_amount`、`ck_group_status`、`ck_group_close`、`ck_group_paid`、`ck_seller_amount`、`ck_seller_status`、`ck_seller_close`、`ck_line_sub/pay/disc/cancel/refund/cnt`、`quote_id` 唯一、`uq_order_event`
- **CAS 契约**：关闭与支付共用 `WHERE closed_at IS NULL AND payment_status = 'unpaid'`；报价单由 `pricing.consumeQuote` 做 `issued→used`
- **事件**：发 `SellerOrderPlaced` / `OrderPaid` / `OrderCancelled` / `OrderCompleted` / `RefundRequested`；消费 `PaymentSucceeded` / `RefundSucceeded`
- **错误码**：`INSUFFICIENT_STOCK`、`PRICE_CHANGED`、`ORDER_ALREADY_CLOSED`
- **验收**：取消与支付并发，只有一方影响 1 行；同一 `quoteId` 下两单，第二单必失败；重复 `RefundSucceeded` 只加一次 `refunded_amount`

## 范围外，但常被问

**「分次支付 / 代付」** ——不做。现在的模型是"一张支付单付一个或多个订单组，一次付清"。分次支付要引入"支付计划"实体，和退款规则缠在一起，等真有需求再设计。

**「订单冻结」** ——不做。平台能做的动作是"关闭"；冻结要冻发货还是冻结算没想清，先不留半个字段。
