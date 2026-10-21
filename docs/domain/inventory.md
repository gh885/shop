# 库存

> 回答 [questions.md](../questions.md) 第 18–27 题。落在 `inventory` 模块，schema 同名。
> 模块 README 见 [inventory](../../apps/server/src/main/java/com/shop/platform/inventory/README.md)。

## 1. 一分钟稿

> 库存只回答一件事：这件货现在还能卖几件。
>
> 前提是**单账本**——商家持货，平台记账，全平台只有一本账。商家不在别处共用这批货，卖掉了得自己回来改。
>
> 所以没有"物理库存 vs 平台副本"的双真相。四个科目：实物、可售、预占、安全库存，恒等式是 `实物 = 可售 + 预占 + 安全`，数据库 `CHECK` 直接管住。
>
> 下单那一刻同步扣可售、加预占，一条条件更新，影响 0 行就是不够卖。支付成功只改预占状态，**实物等到发货才减**——货还在仓库里，账上就不该少。
>
> 预占自带过期时间，上游事件丢了也能自己释放。这是唯一一处不能依赖别人守时的地方。

## 2. 模型与不变式

### 2.1 单账本：一个前提，四个后果

|          | 双账本（接商家 ERP） | **单账本（我们）** |
| -------- | -------------------- | ------------------ |
| 库存真相 | 商家 ERP             | **平台**           |
| 平台那份 | 副本，会过期         | 就是真相本身       |
| 谁在扣   | 平台扣一次，ERP 再扣 | 只有平台扣         |
| 对账     | 跨系统，天天跑       | **不需要跨系统**   |
| 超卖来源 | 两边打架             | 只有平台自己的并发 |
| 商家成本 | 接系统               | 后台自己改         |

四个后果：

1. **没有两份数。** 商家填"我有 100 件"是设总量，之后平台自己算。
2. **对账变成内部自检。** 每天验一遍恒等式，不平就是代码 bug 或有人绕过接口。
3. **超卖只剩一个来源：并发。** 所以整个设计只死守一条——可售量只能条件更新递减。
4. **商家改库存必须是"调整"，不能覆盖。** 每次变动记一条流水，否则账断了查不出来。

一条必须写进商家协议的规矩：**在别处卖了，自己回来改。** 平台不知道也无从知道。

### 2.2 四个科目

```
实物 on_hand  =  可售 available  +  预占 reserved  +  安全 safety
```

`sold` 是累计出库，货已经离开仓库、不占 `on_hand`，只进报表。

- **可售** 是交易链路的权威量，下单条件更新扣的就是它。
- **预占** 是被订单锁定、还没发货的量。
- **安全库存** 商家按 SKU 配的缓冲，压住可售，防漏改和抖动。它不是一个算法，是一个商家自己承担的数字。
- **实物** 商家在后台填的"仓库里到底有多少"。

`available` 允许为负：出现负值说明账上已经超卖（盘亏、商家漏改），必须立刻进告警并补偿在途订单。负数不是 bug，是一个要被看见的状态。

### 2.3 六个操作，各自在哪一步

| 操作         | 时机                     | 动哪几列                                | 能不能异步       |
| ------------ | ------------------------ | --------------------------------------- | ---------------- |
| 预占 reserve | 下单事务内               | `available -n`,`reserved +n`            | **必须同步**     |
| 确认 commit  | 支付成功                 | 只改 `reservation.status`               | 同步，本地       |
| 出库 ship    | 发货                     | `reserved -n`,`on_hand -n`              | 可异步           |
| 释放 release | 取消 / 超时 / 退款未发货 | `reserved -n`,`available +n`            | 可异步，必须幂等 |
| 回补 restock | 退货入库                 | `on_hand +n`                            | 可异步           |
| 调整 adjust  | 商家改总量 / 改安全库存  | `on_hand` 或 `safety`，联动 `available` | 同步             |

**`adjust` 必须走这一个入口，不能直接 `UPDATE stock`。** 商家把总量从 100 改成 80，`available` 要同步减 20，否则 `ck_stock_balance` 当场拒——这正是护栏在工作。

**出库为什么能异步**：可售量在预占那一刻已经减掉了，出库只动实物账，不改变"还能卖几件"。所以它晚几分钟没关系，漏了也能靠流水补。

**预占为什么不能异步**：异步意味着"下单成功了但货没锁住"，中间那段时间别人还能买，这就是超卖的定义。

### 2.4 六条不变式

1. **`on_hand = available + reserved + safety`，任一时点成立。** 由数据库 `CHECK` 强制执行，不靠代码自觉。
2. **可售量只能条件更新递减。** `UPDATE ... WHERE available >= ?`，影响 0 行就是不够卖，直接拒。不许先查后改。
3. **预占自带 `expires_at` + 扫描兜底。** 上游事件丢了，库存也必须能自己放回来。
4. **每次变动必须有一条流水，且带唯一幂等键。** 没有流水，账实对不上时只能猜。
5. **下单链路不读缓存。** 缓存只服务展示。预占读的是库里的那一行。
6. **平台只记账，不平只告警，不自动调平。** 平台是记账方，不是裁决方。

## 3. 表与状态机

三张表：`stock` `reservation` `stock_log`。

### stock

```sql
sku_id       uuid NOT NULL,
warehouse_id uuid NOT NULL,     -- MVP 只有一个默认仓
merchant_id  uuid NOT NULL,     -- 分片键
on_hand      integer NOT NULL,
available    integer NOT NULL,  -- 允许为负：负 = 已超卖，进告警
reserved     integer NOT NULL,
safety       integer NOT NULL DEFAULT 0,
updated_at   timestamptz NOT NULL DEFAULT now(),
PRIMARY KEY (sku_id, warehouse_id),
CONSTRAINT ck_stock_balance CHECK (on_hand = available + reserved + safety),
CONSTRAINT ck_stock_nonneg  CHECK (on_hand >= 0 AND reserved >= 0 AND safety >= 0)
```

**`ck_stock_balance` 是这套设计的核心护栏。** 任何一次写错——漏加可售、重复扣预占、调整总量没同步可售——都会当场被数据库拒掉，而不是等到三个月后对账才发现。

它只约束得了 SQL 层面，绕不过去，除非有人 `DISABLE TRIGGER` 或者手工改。

### reservation

```sql
id              uuid PRIMARY KEY DEFAULT uuidv7(),
sku_id          uuid NOT NULL,
warehouse_id    uuid NOT NULL,
merchant_id     uuid NOT NULL,
order_group_id  uuid NOT NULL,
seller_order_id uuid NOT NULL,
line_no         integer NOT NULL,
quantity        integer NOT NULL,
status          text NOT NULL,          -- reserved | committed | consumed | released | expired
expires_at      timestamptz NOT NULL,   -- 订单 expire_at + 10 分钟宽限
created_at      timestamptz NOT NULL DEFAULT now(),
CONSTRAINT uq_reservation_line UNIQUE (seller_order_id, line_no),
CONSTRAINT ck_reservation_qty  CHECK (quantity > 0)
```

`uq_reservation_line` 就是下单幂等的锚点：**同一张商家单的同一行只能预占一次。**

键必须是 `(seller_order_id, line_no)`，不是 `(order_group_id, line_no)`——`line_no` 只在子单内唯一，一个订单组有两个商家时两边都有第 1 行，用组 id 会撞。

超时任务用部分索引：

```sql
CREATE INDEX idx_reservation_expire
    ON inventory.reservation (expires_at)
    WHERE status = 'reserved';
```

### stock_log

```sql
id               uuid PRIMARY KEY DEFAULT uuidv7(),
sku_id           uuid NOT NULL,
warehouse_id     uuid NOT NULL,
merchant_id      uuid NOT NULL,
type             text NOT NULL,   -- reserve | commit | ship | release | restock | adjust
quantity         integer NOT NULL,          -- 有符号：+ 回补，- 扣减
before_available integer NOT NULL,
after_available  integer NOT NULL,
before_reserved  integer NOT NULL,
after_reserved   integer NOT NULL,
before_safety    integer NOT NULL,
after_safety     integer NOT NULL,
before_on_hand   integer NOT NULL,
after_on_hand    integer NOT NULL,
ref_type         text,            -- order | after_sale | manual
ref_id           uuid,
idempotency_key  text NOT NULL,
operator_type    text NOT NULL,   -- buyer | merchant | system
operator_id      uuid,
created_at       timestamptz NOT NULL DEFAULT now(),
CONSTRAINT uq_stock_log_idem UNIQUE (idempotency_key)
```

**这张表挂 `common.reject_mutation()` 触发器**，和 `audit.audit_log`、`clearing.ledger_entry` 一样只追加。库存流水能被 UPDATE，就等于没有流水。

**幂等键的形状**：`{type}:{ref_id}:{line_no}`，比如 `release:8f3a…:2`。带 `type` 是因为同一行会先 `reserve` 再 `release`，不带类型会撞。

`ref_id` 的层级必须按操作定死，不能一处用 group、一处用 seller order：

| 操作                              | `ref_id`             | `line_no`            |
| --------------------------------- | -------------------- | -------------------- |
| reserve / commit / ship / release | `seller_order_id`    | `order_line.line_no` |
| restock                           | `after_sale_case_id` | 可空，用 0           |
| adjust                            | `adjust_request_id`  | 0                    |

`line_no` 只在 `seller_order` 内唯一；`ref_id` 用 `order_group_id` 会和别的子单撞，必须用 `seller_order_id`。

### 状态机

```
reserved ──支付成功──→ committed ──发货──→ consumed
    │                       │
    │                       └──退款未发货──→ released
    └──超时 / 取消──→ expired / released
```

`released` 和 `expired` 分开记，因为原因不同：一个是有人主动取消，一个是没人管它自己到期。查问题时这两个词差别很大。

## 4. 关键时序

### 下单预占（同步，事务内）

```sql
UPDATE inventory.stock
   SET available = available - :n,
       reserved  = reserved  + :n,
       updated_at = now()
 WHERE sku_id = :sku AND warehouse_id = :wh AND available >= :n;
```

影响行数 = 0 → 库存不足 → 整个下单事务回滚，返回 `INSUFFICIENT_STOCK`。

```sql
INSERT INTO inventory.reservation (...) VALUES (...);   -- uq_reservation_line 挡重复
INSERT INTO inventory.stock_log (...) VALUES (...);     -- uq_stock_log_idem 挡重复
```

三步在同一个事务里：要么全成，要么全不成。**不能先查再改**——查和改之间的窗口就是超卖。

### 每次写的固定顺序

所有库存操作都按同一个顺序走，不许省略：

```
1. 幂等闸门    reservation 条件更新 / stock_log 的唯一键插入
2. 改账        UPDATE stock ... WHERE 前置条件 RETURNING
3. 记流水      INSERT stock_log（before/after 全量四列）
```

同一个事务。**先做闸门再改账**——反过来，重复请求会先改掉数量，再被唯一键拦住，数量已经多扣了一次。

第 2 步必须带 `RETURNING` 或检查影响行数：`WHERE reserved >= n` 影响 0 行说明账已经不对了，这时候要回滚并告警，不能继续往下写流水。只在最后补一条流水，挡不住已经发生的错误改账。

**`stock_log` 要记满 `available` / `reserved` / `safety` / `on_hand` 四个前后值。** 只记两个，事后复原不了守恒式，等于没记。

### 支付成功（本地，改状态）

```sql
UPDATE inventory.reservation SET status = 'committed'
 WHERE id = :id AND status = 'reserved';
```

影响 0 行**不能当"已经处理过"跳过**，必须看当前状态：

| 当前状态                 | 含义           | 动作                                             |
| ------------------------ | -------------- | ------------------------------------------------ |
| `committed` / `consumed` | 重复回调，幂等 | 跳过                                             |
| `released` / `expired`   | **预占没了**   | 重新预占；失败则上报 `trade` 触发整单退款 + 告警 |

**已付款的订单必须有预占。** 预占被提前释放说明货可能已经卖给别人了，这时候硬发货就是超卖，唯一正确的动作是退款。

**不动库存列**——货还在仓库里。

### 发货（可异步，动实物账）

按 §4 的固定顺序，同一个事务：

```sql
-- 1. 幂等闸门：reservation 先推进，重复消费影响 0 行就退出
UPDATE inventory.reservation
   SET status = 'consumed'
 WHERE id = :id AND status = 'committed';

-- 2. 改账，带前置条件和 RETURNING
UPDATE inventory.stock
   SET reserved = reserved - :n,
       on_hand  = on_hand  - :n,
       updated_at = now()
 WHERE sku_id = :sku AND warehouse_id = :wh AND reserved >= :n
 RETURNING available, reserved, safety, on_hand;

-- 3. 记流水，before/after 取上一步 RETURNING + 原值
INSERT INTO inventory.stock_log (...) VALUES (...);
```

`RETURNING` 给的是改后的值；本次只动 `reserved` / `on_hand`，`before = after + n`，`available` / `safety` 不变。不要为了拿 before 再查一次，那会引入新的竞态。

幂等键 `ship:{seller_order_id}:{line_no}`。重复消费同一条发货事件，第一行影响 0 行，直接跳过；`WHERE reserved >= :n` 挡住重复扣减，`ck_stock_balance` 再兜一层。

### 超时释放 + 扫描兜底

```
主：订单撤销事件到达 → release
备：每 5 分钟扫部分索引，捞 status='reserved' AND expires_at < now()，每批 500
```

**`expires_at` = 订单 `expire_at` + 10 分钟宽限。** 宽限是必须的：订单那边的 CAS 得先跑完，库存抢在前面释放就会造出"订单还开着、货已经放回去"的窗口。扫描只做兜底，主路径永远是订单关闭事件。

两条走同一个 handler：

```sql
UPDATE inventory.reservation SET status = 'expired'
 WHERE id = :id AND status = 'reserved';          -- 影响 0 行 → 别人先处理了，跳过
UPDATE inventory.stock
   SET available = available + :n,
       reserved  = reserved  - :n,
       updated_at = now()
 WHERE sku_id = :sku AND warehouse_id = :wh AND reserved >= :n
 RETURNING available, reserved, safety, on_hand;
INSERT INTO inventory.stock_log (...) VALUES (...);
```

三条在同一个事务里；`WHERE reserved >= :n` 挡住重复释放，`ck_stock_balance` 再兜一层。

**兜底不是冗余。** 订单进程挂了、事件丢了、消息队列重建——任何一种都会让预占永久占着货，可售量再也回不来。挂着一天，那件货就少卖一天。

### 热点 SKU

大促时单行 `UPDATE` 是行锁，串行。PG 单行更新大概 1–3k TPS，够不够看业务。

三条措施，按顺序上：

1. **下单前置限流**——秒杀类活动在入口排队，别让请求打到库存行
2. **读走缓存**——详情页、列表页的"有货"标记读 Redis，不打库
3. **拆桶**——把一行拆成 N 行 `stock_bucket`，可售分散，扣减随机挑一个桶。这是最后的办法，因为没有跨行约束，`ck_stock_balance` 那条护栏就失效了，得靠流水兜

前两条现在就能做，第三条等真的有热点再说。

## 5. 失败模式与未决

### 会错在哪

| 现象                       | 根因                    | 怎么防                                         |
| -------------------------- | ----------------------- | ---------------------------------------------- |
| 超卖                       | 先查后改，中间有窗口    | 条件更新 + 影响行数判定                        |
| 预占永久挂着，货卖不出去   | 上游事件丢了            | `expires_at` + 扫描兜底                        |
| 同一笔释放做了两次，多卖了 | 重试没幂等              | `uq_stock_log_idem` + 条件更新                 |
| 守恒式被破坏               | 有人绕过接口直接 UPDATE | `ck_stock_balance` + 流水只追加                |
| 搜索显示有货，点进去没货   | 索引延迟                | 下单以库为准；结算页重新校验                   |
| 商家漏改库存，卖超了       | 平台不知道别处卖了      | 平台兜用户体验（取消 + 退款 + 补偿），再追商家 |
| 盘亏后 `available` 变负    | 商家报少了              | 负值进告警，立刻补偿在途订单                   |
| 热点行被打爆               | 单行行锁串行            | 入口限流 + 读走缓存；拆桶留到最后              |

### 这一版不做

| 不做             | 为什么                                         | 什么时候回来看                      |
| ---------------- | ---------------------------------------------- | ----------------------------------- |
| 多仓             | 表里留了 `warehouse_id`，MVP 只有一个默认仓    | 商家真的有两个以上仓库要分开管      |
| 门店自提库存     | 自提要门店、核销码、到店履约，是另一套         | 出现自提需求时单独设计              |
| 平台选仓 / 调拨  | 平台不替商家决策，调拨是商家自己的事           | 不做，这是范围外                    |
| 拆桶             | 没有跨行约束，会丢 `ck_stock_balance` 这道护栏 | 单 SKU 峰值超过 3k TPS              |
| 预售（允许超卖） | 预售要"卖未来产能"，和"不超卖"是两套模型       | 真要做预售时，用独立的 `presale` 表 |

### 还没想清

- **退货入库谁触发。** 是 `returns` 发事件，还是 `trade` 直接调 `inventory :: api`？取决于退货的验收在哪一步。
- **安全库存按 SKU 还是按仓。** 现在按 `(sku, warehouse)`。单仓时没区别，多仓时会变成一堆重复配置。
- **商家批量改库存怎么做。** 一次导 5000 行 SKU 的库存，要限速、要分批、要能看失败明细——现在只想了单条调整。
- **盘亏之后在途订单怎么取消。** 是自动取消全部预占，还是按优先级保留？取消顺序会影响买家体验。

---

## 实现契约

- **表**：3 张，见 §3
- **库约束**：`ck_stock_balance`（`on_hand = available + reserved + safety`）、`ck_stock_nonneg`、`uq_reservation_line (seller_order_id, line_no)`、`uq_stock_log_idem`
- **写顺序**：幂等闸门 → `UPDATE … WHERE available >= n RETURNING` → 记四列前后值，同一事务
- **事件**：不发也不收。预占、确认、出库、释放全部是 `trade` 在自己事务里调 `inventory :: api` 的同步命令；
  广播 `OrderCancelled` 只会制造"订单已取消但预占还在"的竞态，兜底交给 `expires_at` 扫描
- **错误码**：`INSUFFICIENT_STOCK`
- **验收**：200 并发抢 100 件，成功数恰好 100；同一释放请求打两次，库存只加一次

## 范围外，但常被问

**「平台智能调拨」「多仓履约」** ——不做。平台不持货、不建仓、不搬货，选仓和调拨都是商家自己的事。

**「商家 ERP 对接」** ——不做。单账本模式下商家只需要在后台改数字，接 ERP 是将来做开放平台时的事。
