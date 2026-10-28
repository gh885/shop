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
实物 on_hand  =  可售 available_to_promise  +  预占 reserved  +  安全 safety
```

`sold` 是累计出库，货已经离开仓库、不占 `on_hand`，只进报表。

- **可售** 是交易链路的权威量，下单条件更新扣的就是它。
- **预占** 是被订单锁定、还没发货的量。
- **安全库存** 商家按 SKU 配的缓冲，压住可售，防漏改和抖动。它不是一个算法，是一个商家自己承担的数字。
- **实物** 商家在后台填的"仓库里到底有多少"。

`available_to_promise` 允许为负：出现负值说明账上已经超卖（盘亏、商家漏改），必须立刻进告警并补偿在途订单。负数不是 bug，是一个要被看见的状态。

### 2.3 六个操作，各自在哪一步

| 操作         | 时机                     | 动哪几列                                           | 能不能异步       |
| ------------ | ------------------------ | -------------------------------------------------- | ---------------- |
| 预占 reserve | 下单事务内               | `available_to_promise -n`,`reserved +n`            | **必须同步**     |
| 确认 commit  | 支付成功                 | 只改 `reservation.status`                          | 同步，本地       |
| 出库 ship    | 发货                     | `reserved -n`,`on_hand -n`                         | 可异步           |
| 释放 release | 取消 / 超时 / 退款未发货 | `reserved -n`,`available_to_promise +n`            | 可异步，必须幂等 |
| 回补 restock | 退货入库                 | `on_hand +n` **且** `available_to_promise +n`      | 可异步           |
| 调整 adjust  | 商家改总量 / 改安全库存  | `on_hand` 或 `safety`，联动 `available_to_promise` | 同步             |

**`adjust` 必须走这一个入口，不能直接 `UPDATE stock`。** 商家把总量从 100 改成 80，`available_to_promise` 要同步减 20，否则 `ck_stock_balance` 当场拒——这正是护栏在工作。

**回补的可售必须跟着加。** 回来的货重新可卖；只加 `on_hand` 会被守恒式当场拒，那道护栏正是在提示这一点。

**出库的幂等锚点是包裹，不是订单。** 一个子单可以分多个包裹发，同一行会出库多次；用订单当锚点，
第二个包裹会被当成重复请求吞掉——货发出去了，账上还挂着预占。`reservation.shipped_quantity`
记已出库件数，`shipped_quantity = quantity` 时才转 `consumed`；「发了一部分」不单独占一个状态值，
它的唯一来源就是这个计数。

**出库为什么能异步**：可售量在预占那一刻已经减掉了，出库只动实物账，不改变"还能卖几件"。所以它晚几分钟没关系，漏了也能靠流水补。

**预占为什么不能异步**：异步意味着"下单成功了但货没锁住"，中间那段时间别人还能买，这就是超卖的定义。

### 2.4 六条不变式

1. **`on_hand = available_to_promise + reserved + safety`，任一时点成立。** 由数据库 `CHECK` 强制执行，不靠代码自觉。
2. **可售量只能条件更新递减。** `UPDATE ... WHERE available_to_promise >= ?`，影响 0 行就是不够卖，直接拒。不许先查后改。
3. **预占自带 `expires_at` + 扫描兜底。** 上游事件丢了，库存也必须能自己放回来。
4. **每次变动必须有一条流水，且带唯一幂等键。** 没有流水，账实对不上时只能猜。
5. **下单链路不读缓存。** 缓存只服务展示。预占读的是库里的那一行。
6. **平台只记账，不平只告警，不自动调平。** 平台是记账方，不是裁决方。

## 3. 表与状态机

三张表：`stock` `reservation` `stock_ledger`。

### stock

```sql
sku_id       uuid NOT NULL,
warehouse_id uuid NOT NULL,     -- MVP 只有一个默认仓
merchant_id  uuid NOT NULL,     -- 分片键
on_hand      integer NOT NULL,
available_to_promise    integer NOT NULL,  -- 允许为负：负 = 已超卖，进告警
reserved     integer NOT NULL,
safety       integer NOT NULL DEFAULT 0,
updated_at   timestamptz NOT NULL DEFAULT now(),
PRIMARY KEY (sku_id, warehouse_id),
CONSTRAINT ck_stock_balance CHECK (on_hand = available_to_promise + reserved + safety),
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
quantity        integer NOT NULL,           -- 预占总量，不可变（预占的原样留底）
shipped_quantity integer NOT NULL DEFAULT 0, -- 已出库件数；剩余预占 = quantity - shipped_quantity
status          text NOT NULL,          -- reserved | committed | consumed | released | expired
expires_at      timestamptz NOT NULL,   -- 订单 expires_at + 10 分钟宽限
created_at      timestamptz NOT NULL DEFAULT now(),
CONSTRAINT uq_reservation_line UNIQUE (seller_order_id, line_no),
CONSTRAINT ck_reservation_qty  CHECK (quantity > 0),
CONSTRAINT ck_reservation_shipped CHECK (shipped_quantity >= 0 AND shipped_quantity <= quantity)
```

`uq_reservation_line` 就是下单幂等的锚点：**同一张商家单的同一行只能预占一次。**

键必须是 `(seller_order_id, line_no)`，不是 `(order_group_id, line_no)`——`line_no` 只在子单内唯一，一个订单组有两个商家时两边都有第 1 行，用组 id 会撞。

超时任务用部分索引：

```sql
CREATE INDEX idx_reservation_expire
    ON inventory.reservation (expires_at)
    WHERE status = 'reserved';
```

### stock_ledger

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
ref_type         text,            -- order | package | rma | manual
ref_id           uuid,
idempotency_key  text NOT NULL,
operator_type    text NOT NULL,   -- buyer | merchant | system
operator_id      uuid,
created_at       timestamptz NOT NULL DEFAULT now(),
CONSTRAINT uq_stock_ledger_idem UNIQUE (idempotency_key)
```

**这张表挂 `common.reject_mutation()` 触发器**，和 `audit.entry`、`clearing.ledger_entry` 一样只追加。库存流水能被 UPDATE，就等于没有流水。

**幂等键的形状**：`{type}:{ref_id}:{line_no}`，比如 `release:8f3a…:2`。带 `type` 是因为同一行会先 `reserve` 再 `release`，不带类型会撞。

`ref_id` 的层级必须按操作定死，不能一处用 group、一处用 seller order、一处用包裹：

| 操作                       | `ref_id`            | `line_no`            |
| -------------------------- | ------------------- | -------------------- |
| reserve / commit / release | `seller_order_id`   | `order_line.line_no` |
| ship                       | `package_id`        | `order_line.line_no` |
| restock                    | `rma_case_id`       | `order_line.line_no` |
| adjust                     | `adjust_request_id` | 请求内序号           |

`line_no` 只在 `seller_order` 内唯一；`ref_id` 用 `order_group_id` 会和别的子单撞，必须用 `seller_order_id`。

**出库用 `package_id` 而不是 `seller_order_id`。** 一个子单可以分多个包裹发，同一行会出库多次；
用订单当键，第二个包裹的流水会撞唯一约束、被当成重复请求，货发出去了账上却没动。
用包裹当键，重放同一个包裹恰好是空操作，第二个包裹是一次新的出库。

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
   SET available_to_promise = available_to_promise - :n,
       reserved  = reserved  + :n,
       updated_at = now()
 WHERE sku_id = :sku AND warehouse_id = :wh AND available_to_promise >= :n;
```

影响行数 = 0 → 库存不足 → 整个下单事务回滚，返回 `INSUFFICIENT_STOCK`。

```sql
INSERT INTO inventory.reservation (...) VALUES (...);   -- uq_reservation_line 挡重复
INSERT INTO inventory.stock_ledger (...) VALUES (...);     -- uq_stock_ledger_idem 挡重复
```

三步在同一个事务里：要么全成，要么全不成。**不能先查再改**——查和改之间的窗口就是超卖。

### 每次写的固定顺序

所有库存操作都按同一个顺序走，不许省略：

```
1. 幂等闸门    reservation 条件更新 / stock_ledger 的唯一键插入
2. 改账        UPDATE stock ... WHERE 前置条件 RETURNING
3. 记流水      INSERT stock_ledger（before/after 全量四列）
```

同一个事务。**先做闸门再改账**——反过来，重复请求会先改掉数量，再被唯一键拦住，数量已经多扣了一次。

第 2 步必须带 `RETURNING` 或检查影响行数：`WHERE reserved >= n` 影响 0 行说明账已经不对了，这时候要回滚并告警，不能继续往下写流水。只在最后补一条流水，挡不住已经发生的错误改账。

**`stock_ledger` 要记满 `available_to_promise` / `reserved` / `safety` / `on_hand` 四个前后值。** 只记两个，事后复原不了守恒式，等于没记。

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

**这里不能用「先记账再改账」：`stock_ledger` 的 before/after 是 NOT NULL 全量四列，只有在改账之后才有真值。**
所以出库和回补换一个顺序——先 `FOR UPDATE` 锁行拿权威前值，再记账（幂等闸门），最后条件更新。同一个事务：

```sql
-- 1. 行锁读真值。这一步占住这一行，后面的"记-改"才没有窗口
SELECT ... FROM inventory.stock
 WHERE sku_id = :sku AND warehouse_id = :wh FOR UPDATE;

-- 2. 幂等闸门：包裹是这次出库的事实单。0 行 = 这个包裹的这一行已经出过库，直接跳过
INSERT INTO inventory.stock_ledger (...) VALUES (...)
ON CONFLICT (idempotency_key) DO NOTHING;

-- 3. 改账，带前置条件和 RETURNING
UPDATE inventory.stock
   SET reserved = reserved - :n,
       on_hand  = on_hand  - :n,
       updated_at = now()
 WHERE sku_id = :sku AND warehouse_id = :wh AND reserved >= :n AND on_hand >= :n
 RETURNING available_to_promise, reserved, safety, on_hand;

-- 4. 推进预占：发完才转 consumed，没发完继续挂着 committed
UPDATE inventory.reservation
   SET shipped_quantity = shipped_quantity + :n,
       status = CASE WHEN shipped_quantity + :n = quantity THEN 'consumed' ELSE status END
 WHERE id = :id AND status = 'committed'
   AND shipped_quantity + :n <= quantity;
```

`FOR UPDATE` 不引入新的竞态（第 3 步的 UPDATE 本来就要拿这把行锁），代价是把它退化成"锁 + 更新"。
换来的是流水里的 `before` 是**真值**而不是反推值——反推在有历史 bug 的场景下会把错误原样记进账本，
而对账时账本正是那个基准。出库和回补都不在下单路径上，量级差一到两个数量级，这笔代价划得来。

幂等键 `ship:{package_id}:{line_no}`。同一包裹重放，第 2 步影响 0 行；第二个包裹是一次新的出库。
`WHERE reserved >= :n AND on_hand >= :n` 挡住重复扣减，`ck_stock_balance` 再兜一层。

### 超时释放 + 扫描兜底

```
主：订单撤销事件到达 → release
备：每 5 分钟扫部分索引，捞 status='reserved' AND expires_at < now()，每批 500
```

**`expires_at` = 订单 `expires_at` + 10 分钟宽限。** 宽限是必须的：订单那边的 CAS 得先跑完，库存抢在前面释放就会造出"订单还开着、货已经放回去"的窗口。扫描只做兜底，主路径永远是订单关闭事件。

两条走同一个 handler：

```sql
UPDATE inventory.reservation SET status = 'expired'
 WHERE id = :id AND status = 'reserved';          -- 影响 0 行 → 别人先处理了，跳过
UPDATE inventory.stock
   SET available_to_promise = available_to_promise + :n,
       reserved  = reserved  - :n,
       updated_at = now()
 WHERE sku_id = :sku AND warehouse_id = :wh AND reserved >= :n
 RETURNING available_to_promise, reserved, safety, on_hand;
INSERT INTO inventory.stock_ledger (...) VALUES (...);
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

| 现象                               | 根因                    | 怎么防                                                                        |
| ---------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| 超卖                               | 先查后改，中间有窗口    | 条件更新 + 影响行数判定                                                       |
| 预占永久挂着，货卖不出去           | 上游事件丢了            | `expires_at` + 扫描兜底                                                       |
| 同一笔释放做了两次，多卖了         | 重试没幂等              | `uq_stock_ledger_idem` + 条件更新                                             |
| 货发出去了但实物没减               | 发货没接出库            | 发货链路里同步调 `ship`；`InventoryFlowTest` 端到端守                         |
| 分两包发第二包被当成重放           | 幂等键用了订单          | 幂等键锚定 `package_id`                                                       |
| 守恒式被破坏                       | 有人绕过接口直接 UPDATE | `ck_stock_balance` + 流水只追加                                               |
| 有人直接改 stock 绕过接口          | 没有出口能验证          | `InventoryAuditJob` 日检「流水 vs 库存」，最后一条流水的 after 必须等于库存行 |
| 搜索显示有货，点进去没货           | 索引延迟                | 下单以库为准；结算页重新校验                                                  |
| 商家漏改库存，卖超了               | 平台不知道别处卖了      | 平台兜用户体验（取消 + 退款 + 补偿），再追商家                                |
| 盘亏后 `available_to_promise` 变负 | 商家报少了              | 负值进告警，立刻补偿在途订单                                                  |
| 热点行被打爆                       | 单行行锁串行            | 入口限流 + 读走缓存；拆桶留到最后                                             |

### 这一版不做

| 不做             | 为什么                                         | 什么时候回来看                      |
| ---------------- | ---------------------------------------------- | ----------------------------------- |
| 多仓             | 表里留了 `warehouse_id`，MVP 只有一个默认仓    | 商家真的有两个以上仓库要分开管      |
| 门店自提库存     | 自提要门店、核销码、到店履约，是另一套         | 出现自提需求时单独设计              |
| 平台选仓 / 调拨  | 平台不替商家决策，调拨是商家自己的事           | 不做，这是范围外                    |
| 拆桶             | 没有跨行约束，会丢 `ck_stock_balance` 这道护栏 | 单 SKU 峰值超过 3k TPS              |
| 预售（允许超卖） | 预售要"卖未来产能"，和"不超卖"是两套模型       | 真要做预售时，用独立的 `presale` 表 |

### 还没想清

- **安全库存按 SKU 还是按仓。** 现在按 `(sku, warehouse)`。单仓时没区别，多仓时会变成一堆重复配置。
- **盘亏之后在途订单怎么取消。** 是自动取消全部预占，还是按优先级保留？取消顺序会影响买家体验。
- **批量调整的失败明细。** 现在整批一个事务、失败即全回滚（要么全成要么全不成）。一次导 5000 行时，
  商家可能更想要"这 12 行错了，其余 4988 行先落"——那是另一种语义，要单独设计返回形状。

---

## 实现契约

- **表**：3 张，见 §3
- **库约束**：`ck_stock_balance`（`on_hand = available_to_promise + reserved + safety`）、`ck_stock_nonneg`、
  `ck_reservation_shipped`、`uq_reservation_line (seller_order_id, line_no)`、`uq_stock_ledger_idem`
- **写顺序**：
    - 预占：插 `reservation`（幂等闸门）→ `UPDATE … WHERE available_to_promise >= n RETURNING` → 记流水
    - 出库 / 回补：`SELECT … FOR UPDATE` → 记流水（`ON CONFLICT DO NOTHING` 即幂等闸门）→ 条件 `UPDATE RETURNING` → 推进预占
    - 两套顺序不同是有原因的：`stock_ledger` 的 before/after 只能在改账之后才有真值，所以它当不了第一步的闸门
    - 全部在同一个事务里
- **事件**：不发也不收。预占、确认、出库、释放、回补、调整全部是调用方在自己事务里调 `inventory :: api` 的同步命令；
  广播 `OrderCancelled` 只会制造"订单已取消但预占还在"的竞态，兜底交给 `expires_at` 扫描
- **错误码**：`INSUFFICIENT_STOCK`
- **验收**（`InventoryLedgerTest` / `InventoryFlowTest` 是可执行版）：200 并发抢 100 件恰好成功 100；
  同一释放请求打两次库存只加一次；同一包裹重放实物只减一次；3 件分两包发第二包后转 `consumed`；
  直接 `UPDATE stock` 破坏守恒被库拒；`UPDATE stock_ledger` 被只追加触发器拒；
  调整到低于预占时可售为负且不被拒；同一 `requestId` 的批量调整重放只落一遍账

## 范围外，但常被问

**「平台智能调拨」「多仓履约」** ——不做。平台不持货、不建仓、不搬货，选仓和调拨都是商家自己的事。

**「商家 ERP 对接」** ——不做。单账本模式下商家只需要在后台改数字，接 ERP 是将来做开放平台时的事。
