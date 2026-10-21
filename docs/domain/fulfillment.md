# 履约

> 回答 [questions.md](../questions.md) 第 63–67 题。落在 `fulfillment` 模块，schema 同名。
> 模块 README 见 [fulfillment](../../apps/server/src/main/java/com/shop/platform/fulfillment/README.md)。

## 1. 一分钟稿

> 履约只回答一件事：这些货怎么到了买家手里。
>
> 一条边界先立住——**`fulfillment` 管状态机，`logistics` 管适配。** 承运商的轨迹码上千种，翻译成平台标准码那一步放在 `logistics`；`fulfillment` 只认八个标准码。
>
> 包裹是唯一事实，订单只存"发了几件"的计数器。一个商家单可以发多个包裹，一个包裹也能装多行——所以拆包由商家决定，平台只要求每个包裹能追溯到订单行和数量。
>
> 状态单调，只升不降。签收之后再来一条"运输中"，不改状态，只记下来。
>
> 电子面单不做，商家自己打单填运单号。这一条砍掉了整个"取面单"的同步外部调用。

## 2. 模型与不变式

### 2.1 一条边界：状态机 vs 适配

|            | `fulfillment`                        | `logistics`                    |
| ---------- | ------------------------------------ | ------------------------------ |
| 管什么     | 包裹、状态机、时效                   | 承运商对接、轨迹标准化         |
| 存什么     | `package` `package_item` `ship_task` | `trace_event`（原始 + 标准码） |
| 认什么     | 八个标准码                           | 上千种承运商码                 |
| 出错长这样 | 状态跳错                             | 码认错                         |

**为什么映射不放 `fulfillment`：** 承运商加一家，映射就要加一份。那是适配工作，不该让状态机跟着改。

`logistics` 收到 webhook → 落 `trace_event` 原始行 → 翻成标准码 → 调 `fulfillment :: api` 回写。方向是 `logistics → fulfillment`，不反向。

### 2.2 包裹是唯一事实

订单那边只存 `shipped_qty` / `received_qty` 两个计数器（见 [order-model.md](order-model.md) §2.5）。包裹、运单号、轨迹全在这里。

拆包规则由商家定：按仓库拆、按体积拆、按批次拆都行。**平台不替商家决定拆几个包裹**，只要求每个包裹能追溯到订单行和数量。

一个包裹装多行、一行拆到多个包裹，都靠 `package_item` 表达。

### 2.3 八个标准码

| 标准码             | 含义     | 推进到       |
| ------------------ | -------- | ------------ |
| `collected`        | 揽收     | shipped      |
| `in_transit`       | 运输中   | in_transit   |
| `out_for_delivery` | 派送中   | in_transit   |
| `delivered`        | 签收     | delivered    |
| `rejected`         | 拒收     | returned     |
| `returned`         | 退回     | returned     |
| `exception`        | 异常     | 不变，只记录 |
| `unknown`          | 认不出来 | 不变，只记录 |

**`unknown` 必须存在。** 没有这一档，遇到新码只有两个坏选择：猜一个，或者报错把整条轨迹丢掉。猜错会把"退签"当"签收"，直接触发结算——那是资损。

### 2.4 五条不变式

1. **状态单调，只升不降。** `delivered` 之后收到的任何码都不改状态。
2. **不认识的码不推进状态。** 记 `unknown` + 告警，等人补映射。
3. **每个包裹必须能追溯到 `order_line` + 数量**，且同一订单行在所有包裹里的数量之和不超过它本身。
4. **确认收货是订单的动作。** `fulfillment` 只提供"签收时间"这个事实，`trade` 负责迁移状态。
5. **平台不替商家决定拆包。** 只约束可追溯，不约束怎么拆。

## 3. 表与状态机

三张表：`package` `package_item` `ship_task`。

### package

```sql
id              uuid PRIMARY KEY DEFAULT uuidv7(),
package_no      text NOT NULL,            -- 对外包裹号，BizNo
seller_order_id uuid NOT NULL,
merchant_id     uuid NOT NULL,            -- 分片键
delivery_type   text NOT NULL DEFAULT 'express',  -- MVP 只有 express
carrier_code    text,                     -- 承运商代码，logistics 的枚举
tracking_no     text,
status          text NOT NULL,            -- created | shipped | in_transit | delivered | returned | cancelled
shipped_at      timestamptz,
delivered_at    timestamptz,
last_track_at   timestamptz,              -- 最后一条轨迹时间，停滞检测靠它
signed_by       text,                     -- 签收人，轨迹里有就存
created_at      timestamptz NOT NULL DEFAULT now(),
CONSTRAINT uq_package_no      UNIQUE (package_no),
CONSTRAINT uq_package_tracking UNIQUE (carrier_code, tracking_no),
CONSTRAINT ck_package_type     CHECK (delivery_type = 'express'),   -- 加自提时再放开
CONSTRAINT ck_package_status   CHECK (status IN ('created','shipped','in_transit','delivered','returned','cancelled')),
CONSTRAINT ck_package_tracking_required CHECK (
    status IN ('created','cancelled') OR (carrier_code IS NOT NULL AND tracking_no IS NOT NULL)
)
```

`uq_package_tracking` 是防重复录入的：同一个运单号只能挂一个包裹。商家手误录两遍会被数据库挡住，不用等到买家收到两个一样的包裹才发现。

索引 `idx_package_seller_order (seller_order_id)`。

### package_item

```sql
package_id    uuid NOT NULL,
order_line_id uuid NOT NULL,
quantity      integer NOT NULL,
PRIMARY KEY (package_id, order_line_id),
CONSTRAINT ck_package_item_qty CHECK (quantity > 0)
```

**这张表就是"拆包"的全部表达。** 一行拆两包 → 两行记录；两行装一包 → 两行记录。

### ship_task

```sql
id              uuid PRIMARY KEY DEFAULT uuidv7(),
seller_order_id uuid NOT NULL,
merchant_id     uuid NOT NULL,
due_at          timestamptz NOT NULL,     -- 承诺发货截止
status          text NOT NULL,            -- pending | shipped | overdue | cancelled
overdue_at      timestamptz,
created_at      timestamptz NOT NULL DEFAULT now(),
CONSTRAINT uq_ship_task_order UNIQUE (seller_order_id)
```

`due_at` = 支付时间 + 承诺时效。时效按类目配，默认 48 小时。一个商家单一条任务，发多个包裹不影响它——第一个包裹发出就置 `shipped`。**`overdue` 之后仍然可以发货**：它只表示曾经超过承诺时间，首个包裹发出后照样置 `shipped`。

超时检测用部分索引：

```sql
CREATE INDEX idx_ship_task_due
    ON fulfillment.ship_task (due_at)
    WHERE status = 'pending';
```

### 状态机

```
created ──填运单号──→ shipped ──揽收──→ in_transit ──签收──→ delivered
   │                                │
   └──商家取消──→ cancelled          ├──拒收 / 退回──→ returned
                                    └──轨迹超时未更新──→ 人工确认
```

`returned` 之后是售后的事，`fulfillment` 不再管。

## 4. 关键时序

### 发货（商家操作）

```
商家在后台填 承运商 + 运单号（+ 拆包明细）
  → 校验：数量之和 ≤ 订单行数量
  → package(status=shipped, shipped_at=now)
  → package_item × N
  → 调 trade.recordShipment（api 命令，不是事件）
      → order_line.shipped_qty += n
      → 重算子单 fulfillment_status
  → ship_task.status = shipped
```

**MVP 不取电子面单。** 商家用自己的快递账号打单，平台只收运单号。这一条省掉了"在事务里调外部 HTTP"，也省掉了承运商账号体系。

### 轨迹回写

```
承运商 webhook → logistics
  → 验签、落 trace_event（原始码、时间、描述）
  → 翻成标准码（认不出 → unknown）
  → 调 fulfillment.recordTrace(packageId, standardCode, occurredAt)
      → 状态单调推进（只升不降）
      → 更新 last_track_at
      → delivered 时写 delivered_at
```

`logistics` 调用失败会重试；`recordTrace` 必须幂等——同一 `(packageId, standardCode, occurredAt)` 来两次只生效一次。

### 确认收货

两条路，走同一个 handler：

```
手动：买家点确认 → trade 迁移 seller_order.received
自动：同一 seller_order 下所有 package 都 delivered，取最晚 delivered_at + N 天（默认 10，可配）→ 定时任务 → 同上
```

**部分签收不自动确认。** 只要还有一个包裹没到 `delivered`，就继续等；全部到齐后从最晚那个 `delivered_at` 起算。一个商家单发 3 个包裹，前两个签收、第三个运输中，订单侧仍然是"待收货"。

兜底扫表用延时队列 + 部分索引，和订单超时那套一样。**自动确认漏一次，商家的钱就永远不到账**——这条必须双保险。

### 时效检测（每小时跑一次）

| 检测         | 条件                                             | 动作                       |
| ------------ | ------------------------------------------------ | -------------------------- |
| 发货超时     | `ship_task.pending` 且 `due_at < now()`          | 置 `overdue`，上报 `trust` |
| 疑似虚假发货 | `shipped` 且 24 小时无 `collected` 轨迹          | 告警，上报 `trust`         |
| 物流停滞     | `in_transit` 且 `last_track_at` 超 72 小时无更新 | 告警                       |

**检测在这里，处置在 `trust`。** `fulfillment` 通过 `trust :: api` 报一条违规线索，扣多少分、要不要限流、要不要罚，是治理的事。这样履约模块不需要知道任何处罚规则。

## 5. 失败模式与未决

### 会错在哪

| 现象                           | 根因             | 怎么防                       |
| ------------------------------ | ---------------- | ---------------------------- |
| 签收后状态被一条旧轨迹改回去   | 没有单调约束     | 状态只升不降，旧码只记录     |
| 新承运商的码被当成"签收"       | 猜码             | 认不出就是 `unknown`，绝不猜 |
| 同一个运单号挂两个包裹         | 商家重复录       | `uq_package_tracking`        |
| 包裹数量超过订单行数量         | 没校验上限       | 发货前校验 Σ quantity        |
| 自动确认收货漏了，商家收不到钱 | 定时任务挂了     | 延时队列 + 扫表双保险        |
| 虚假发货没被发现               | 只看有没有运单号 | 要看 24 小时内有没有揽收轨迹 |
| 轨迹重复回写，状态抖动         | 回调重试         | `recordTrace` 幂等           |

### 这一版不做

| 不做     | 为什么                                          | 什么时候回来看             |
| -------- | ----------------------------------------------- | -------------------------- |
| 电子面单 | 要承运商账号体系 + 事务外调用，商家自己打单更省 | 商家量上来要求平台统一面单 |
| 自提     | 要门店、核销码、提货期限，是另一套交付凭证      | 出现自提需求时单独设计     |
| 同城配送 | 要骑手调度和时段，和快递不是一个模型            | 同上                       |
| 平台选仓 | 平台不持货，选仓是商家的事                      | 不做，范围外               |

`delivery_type` 这一列留着，就是为了将来加自提和同城时不用改表。但**现在只允许 `express` 一个值**，`CHECK` 挡住。

### 还没想清

- **部分签收。** 一个包裹里 3 行，买家只收到 2 行。现在包裹整体签收，这种情形只能走售后。
- **多包裹的聚合展示。** 一个商家单发 3 个包裹，买家看到"已发货"还是"部分到货"？展示规则要和 `trade` 的展示态对齐。
- **承运商白名单谁维护。** 现在 `carrier_code` 是个字符串，没有约束，商家填错就查不到轨迹。
- **丢件怎么判。** 轨迹长久不动，是买家申请退款还是平台主动介入？这条和售后那篇有交叉。

---

## 实现契约

- **表**：3 张，见 §3
- **库约束**：`uq_package_tracking (carrier_code, tracking_no)`、`ck_package_type`（MVP 只允许 `express`）、`ck_package_status`、`ck_package_tracking_required`、`uq_ship_task_order`
- **输入契约**：`recordTrace(packageId, standardCode, occurredAt)` 必须幂等
- **事件**：不发；消费 `OrderPaid`
- **错误码**：`PACKAGE_NOT_FOUND`、`INVALID_TRACK_CODE`
- **验收**：`delivered` 之后再收到 `in_transit`，状态不变；同一轨迹重复回写只生效一次

## 范围外，但常被问

**「平台仓储」** ——不做。平台不持货、不建仓，货在商家自己的仓库或者第三方仓。

**「智能选仓 / 调拨」** ——不做。选哪个仓发、要不要调货，是商家 ERP 的事。
