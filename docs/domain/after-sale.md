# 售后

> 回答 [questions.md](../questions.md) 第 68–72 题。落在 `returns` 模块，schema 同名；平台介入归 `dispute`。
> 模块 README 见 [returns](../../apps/server/src/main/java/com/shop/platform/returns/README.md)。

## 1. 一分钟稿

> 售后只回答一件事：这笔钱该不该退、退多少、谁出。
>
> 三种类型——仅退款、退货退款、换货——**不是三套状态机**，是一套骨架加一个"要不要把货寄回来"的开关。
>
> 所有类型共用一条机制：**当前该谁动、什么时候到期、到期自动干什么**，存成三列，定时任务统一执行。所以"商家超时不处理就自动同意"不是硬编码，是这条机制的其中一个取值。
>
> 判责决定谁承担运费和损失，但平台**只记录结论，不代收退货运费**。让平台去代收代付那几百块的快递费，收益远小于复杂度。
>
> 已经结算给商家的钱要退，商家余额变负，从后续结算里扣；一直欠就从保证金扣。

## 2. 模型与不变式

### 2.1 一套骨架，三种类型

|            | 仅退款       | 退货退款             | 换货               |
| ---------- | ------------ | -------------------- | ------------------ |
| 要不要寄回 | 否           | 是                   | 是                 |
| 商家收货后 | —            | 验收后退钱           | 验收后重新发货     |
| 完成标志   | 钱到账       | 钱到账               | 新运单号录入       |
| 典型场景   | 未发货、少件 | 质量问题、七天无理由 | 尺码不对、颜色发错 |

状态机：

```
applied ──商家同意──→ approved ──(退货/换货)──→ shipping_back ──商家收货──→ received
   │                     │                                                    │
   ├──商家拒绝──→ rejected│                                        ┌───────────┴───────────┐
   ├──买家撤销──→ cancelled│                                       ↓                       ↓
   └──超时未处理──→ approved                                    refunding              reshipping
                                                                  ↓                       ↓
                                                              completed               completed
```

仅退款跳过 `shipping_back` 和 `received`，`approved` 直接进 `refunding`。

平台介入时进入 `disputed`：上面所有非终态都可以转入，进入时清空 `deadline_*`，由 `dispute` 模块的仲裁时钟接管；裁决后再由 `returns` 写回下一段状态和新的 `deadline_*`。

**不做三套表、三套状态机。** 三种类型的区别只在"中间有一段货物往返"，把它抽成可选阶段，代码里只有一个 `type` 分叉。

### 2.2 超时不是特例，是通用机制

每个非终态都带三列：`deadline_at`、`deadline_actor`、`deadline_action`。

| 状态            | 该谁动 | 期限       | 到期做什么             |
| --------------- | ------ | ---------- | ---------------------- |
| `applied`       | 商家   | 48h        | 自动同意（`approved`） |
| `approved`      | 买家   | 7 天       | 自动关闭（视为放弃）   |
| `shipping_back` | 商家   | 收货后 48h | 自动退款/自动发货      |
| `received`      | 商家   | 48h        | 自动退款/自动发货      |
| `disputed`      | 平台   | 仲裁时钟   | 无，`dispute` 接管     |

定时任务只做一件事：扫 `deadline_at < now()` 且未终态的 case，执行 `deadline_action`，然后写下一段的三列。

**这套机制的好处**：以后加"平台审核 24 小时"、"物流异常等待 72 小时"，只加一行配置，不加代码。硬编码每一条"XX 超时自动 YY"，第五个规则进来就开始乱。

### 2.3 判责：谁的责任，谁出钱

| 责任           | 怎么来的                     | 运费     | 损失     |
| -------------- | ---------------------------- | -------- | -------- |
| `merchant`     | 质量问题、错发漏发、描述不符 | 商家承担 | 商家承担 |
| `buyer`        | 不喜欢、拍错、无理由         | 买家承担 | 买家承担 |
| `platform`     | 仲裁判定，或两边都没证据     | 按裁决   | 视裁决   |
| `undetermined` | 刚提交，还没人认             | 待定     | 待定     |

默认值由 `reason_code` 推出来（选了"质量问题"就是商家责任），商家或平台可以改，**改了必须留痕**——写进 `case_log`，带上是谁改的。

判责决定退款金额里哪部分由谁承担，但**平台不代收退货运费**。买家和商家之间的快递费线下解决，平台只在结算时按判责结果处理商品款和运费补贴。

### 2.4 五条不变式

1. **一个 case 只能针对已支付的订单行**，且累计退款数量不超过该行数量。
2. **退款金额不能超过该行实付。** 含优惠分摊——按 `order_line_discount` 算，不按原价算。
3. **状态只能由当前 `deadline_actor` 对应的角色推进**（超时机制除外）。商家不能替买家撤销，买家不能替商家发货。
4. **每个 case 必须落到终态。** 挂着不动的 case 会永久占住结算，商家的钱永远到不了账。
5. **钱只走分录，不改订单金额。** 退款是新增一组分录，订单行上的 `refunded_amount` 只是计数器。

一个订单行可以开多次售后，但**同一时间只能有一个未终态 case**；累计退款数量不超过该行数量。售后单和订单行是多对一，和订单是一对多——订单侧不存售后状态，只从 `returns` 取叠加态。

## 3. 表与状态机

五张表：`after_sale_case` `case_item` `return_shipment` `case_evidence` `case_log`。

### after_sale_case

```sql
id                    uuid PRIMARY KEY DEFAULT uuidv7(),
case_no               text NOT NULL,          -- 对外售后单号，BizNo
seller_order_id       uuid NOT NULL,
merchant_id           uuid NOT NULL,          -- 分片键
buyer_id              uuid NOT NULL,
type                  text NOT NULL,          -- refund_only | return_refund | exchange
status                text NOT NULL,
reason_code           text NOT NULL,          -- 买家选的原因
responsibility        text NOT NULL,          -- merchant | buyer | platform | undetermined
refund_amount         bigint NOT NULL DEFAULT 0,
shipping_refund_amount bigint NOT NULL DEFAULT 0,
currency              char(3) NOT NULL DEFAULT 'CNY',
deadline_at           timestamptz,
deadline_actor        text,                   -- buyer | merchant | platform | system
deadline_action       text,                   -- auto_approve | auto_close | auto_refund | auto_ship
approved_at           timestamptz,
completed_at          timestamptz,
created_at            timestamptz NOT NULL DEFAULT now(),
CONSTRAINT uq_case_no   UNIQUE (case_no),
CONSTRAINT ck_case_type CHECK (type IN ('refund_only','return_refund','exchange')),
CONSTRAINT ck_case_status CHECK (status IN (
    'applied','approved','rejected','cancelled','shipping_back','received',
    'refunding','reshipping','completed','disputed'
)),
CONSTRAINT ck_case_amount CHECK (refund_amount >= 0 AND shipping_refund_amount >= 0)
```

`shipping_refund_amount` 只表示**原订单运费**的退款，不表示买家寄回的运费。退货运费按判责线下解决，平台不代收代付。

索引：

```sql
CREATE INDEX idx_case_order ON returns.after_sale_case (seller_order_id);

-- 超时扫描只扫非终态
CREATE INDEX idx_case_deadline ON returns.after_sale_case (deadline_at)
    WHERE status NOT IN ('completed','cancelled','rejected');
```

### case_item

```sql
case_id       uuid NOT NULL,
order_line_id uuid NOT NULL,
quantity      integer NOT NULL,
refund_amount bigint NOT NULL,
PRIMARY KEY (case_id, order_line_id),
CONSTRAINT ck_case_item_qty CHECK (quantity > 0)
```

一个 case 可以退多行（一次退整单里三件不同商品），也可以只退一件。所以判责和退款金额都在行上算，主表存汇总。

### return_shipment

```sql
id           uuid PRIMARY KEY DEFAULT uuidv7(),
case_id      uuid NOT NULL,
carrier_code text NOT NULL,
tracking_no  text NOT NULL,
status       text NOT NULL,          -- created | in_transit | received | lost
shipped_at   timestamptz,
received_at  timestamptz,
CONSTRAINT uq_return_shipment_case UNIQUE (case_id)
```

**逆向物流只记买家寄回那一段。** 换货时商家重发的新包裹走 `fulfillment`，不在这里。

`uq_return_shipment_case` 保证一个 case 只有一条退货物流——买家补寄第二次要走新 case，不然责任和金额都算不清。

### case_evidence

```sql
id            uuid PRIMARY KEY DEFAULT uuidv7(),
case_id       uuid NOT NULL,
uploader_type text NOT NULL,      -- buyer | merchant | platform
uploader_id   uuid NOT NULL,
media_url     text NOT NULL,
description   text,
created_at    timestamptz NOT NULL DEFAULT now()
```

举证是判责的依据。没有它，判责就是客服凭印象说了算。

### case_log

```sql
id          uuid PRIMARY KEY DEFAULT uuidv7(),
case_id     uuid NOT NULL,
from_status text,
to_status   text NOT NULL,
actor_type  text NOT NULL,     -- buyer | merchant | platform | system
actor_id    uuid,
reason      text,
created_at  timestamptz NOT NULL DEFAULT now()
```

每次状态变化一行，改判责也记一行。**没有它，「这单为什么给退了」只能靠猜。** `case_log` 同样挂 `common.reject_mutation()`，只追加，不能事后改。

## 4. 关键时序

### 仅退款

```
买家提交（选原因、传举证）→ applied，deadline = 48h / 商家 / auto_approve
  ├─ 商家同意 → approved → 立刻 refunding
  ├─ 商家拒绝 → rejected（买家可申请平台介入，或重新提交）
  └─ 48h 无人处理 → 系统自动 approved
```

### 退货退款

```
买家提交 → applied
  → 商家同意 → approved，deadline = 7 天 / 买家 / auto_close
  → 买家填退货运单号 → shipping_back
  → 商家签收 → received，deadline = 48h / 商家 / auto_refund
  → 商家确认退款 → refunding → completed
```

商家签收后不确认，48 小时自动退款。**这一条是防止商家拖着不处理。**

### 退款执行：退货和仅退款共用

`returns` 不直接调渠道，但**是同步命令，不是事件**：

```java
payment.refund(orderGroupId, sellerOrderId, refundAmount, currency, reason = caseId)
```

`payment` 里原路退回，成功发 `RefundSucceeded`（带 `bizRef = caseId`）；`returns` 收到后把 case 推到 `completed` 并回写订单计数器。

**为什么不是事件**：`payment` 订阅 `returns` 的事件会让依赖变成 `payment → returns → trade → payment`，一个真环。走命令，方向是 `returns → payment`，和 `trade → payment` 同向，不成环。

**钱仍然不经过 `returns` 的账户**：它只决定"该退多少"，渠道退款是 `payment` 的事。渠道没受理时返回 `success=false`，case 停在 `refunding`——**不能假装成功**，那会让售后单走到"已完成"而钱根本没出去。

### 平台介入与先行赔付

```
买家/商家任一方不服 → case 状态 disputed
  → dispute 模块接管：举证、仲裁、出裁决
  → 发 DisputeResolved(caseId, merchantId, ruling, amount)
      ├→ returns：把 case 推到终态
      └→ clearing：执行赔付分录
```

先行赔付的记账（简化版，完整在 [ledger.md](ledger.md)）：

```
平台先垫给买家（平台自有资金，不动备付金）：
  platform.receivable   +100
  platform.available    -100

商家后续结算时扣回：
  merchant.available    -100
  platform.receivable   -100
```

`platform.receivable` 是 ledger 的应收账户类型；`platform.available` 是平台自有资金，**不是持牌机构的备付金**。只记"付了 100"而不记"商家欠我 100"，这笔钱就再也追不回来了。

### 已结算之后的退款

| 商家余额        | 怎么退                     |
| --------------- | -------------------------- |
| 待结算 ≥ 退款额 | 直接扣待结算               |
| 待结算 < 退款额 | 差额把余额打成负数（欠款） |
| 欠款一直不还    | 从保证金扣（`funding`）    |

**负余额是正常状态，不是异常。** 商家这个月退了上个月已经结走的钱，余额就是负的，下个月结算先抵扣。禁止负余额等于逼系统去改历史分录。

## 5. 失败模式与未决

### 会错在哪

| 现象                       | 根因                 | 怎么防                                        |
| -------------------------- | -------------------- | --------------------------------------------- |
| 退款退多了，超过实付       | 按原价算，没按分摊算 | 退款金额上限 = `order_line_discount` 里的实付 |
| 同一个订单行被退两次       | 没校验累计数量       | `case_item` 累计 + 订单行 `refunded_qty`      |
| case 挂半年不动            | 没有超时机制         | 每个非终态都有 `deadline_*`                   |
| 商家拖着不签收             | 只做了超时同意       | 收货后 48h 自动退款                           |
| 平台垫了钱没记账，追不回来 | 只记支出不记债权     | 两条分录，缺一不可                            |
| 判责被偷偷改掉             | 改判责没留痕         | `case_log` 记一条，带 actor                   |
| 商家余额负了以后系统报错   | 把负余额当异常       | 负余额是正常状态，允许存在                    |

### 这一版不做

| 不做             | 为什么                                     | 什么时候回来看           |
| ---------------- | ------------------------------------------ | ------------------------ |
| 运费险           | 要接保险供应商，是外部产品                 | 出现真实需求时单独设计   |
| 平台代收退货运费 | 几百块的快递费走平台代付，收益远小于复杂度 | 不做                     |
| 大众评审         | 淘宝那套众包判责，需要用户量和信用体系     | 平台介入量上来以后再看   |
| 换货的库存联动   | 换货重发要占库存，现在是商家手工处理       | 换货量大时接 `inventory` |

### 还没想清

- **部分退款的优惠重算。** 凑单后退一件，满减还算不算？[pricing.md](pricing.md) 说不重算、按快照分摊退，但极端情况下退完可能比实付多。
- **超时自动同意之后的举证。** 商家没看到、系统自动同意了，事后能撤销吗？淘宝是不能，我们没定。
- **多次售后。** 一个订单行退了一次、又出问题再退一次，要不要合并成一个 case？
- **平台介入的成本。** 每个仲裁都要人工，量一大就撑不住。什么时候开始做自动判责，没定。

---

## 实现契约

- **表**：5 张，见 §3
- **库约束**：`uq_case_no`、`ck_case_type`、`ck_case_status`、`ck_case_amount`、`ck_case_item_qty`、`uq_return_shipment_case`；`case_log` 挂 `reject_mutation()`
- **超时契约**：每个可自动推进的非终态必有 `deadline_at / deadline_actor / deadline_action` 三列，扫描器只执行不判断；`disputed` 由 `dispute` 的仲裁时钟接管，`deadline_*` 清空
- **事件**：消费 `RefundSucceeded`；**不**发 `ReturnApproved`（改成同步调 `payment.refund`，见 §4）
- **错误码**：`CASE_NOT_FOUND`、`REFUND_EXCEEDS_PAID`、`INVALID_CASE_STATE`
- **验收**：48 小时不处理自动同意；退款金额超过 `order_line_discount` 实付被拒；`disputed` 期间超时扫描不推进状态

## 范围外，但常被问

**「平台自营售后」** ——不做。平台不持货，商品的售后责任在商家。

**「售后时效的类目差异」** ——现在是全局 48 小时。按类目配时效（生鲜 24h、大家电 7 天）要做，但字段已经留了位置，等真实类目运营起来再配。
