# inventory — 库存

> 核心域 · schema `inventory` · 进行中

```yaml
module: inventory
layer: 核心域
schema: inventory
status: in-progress
depends_on: []
emits: []
consumes: []
```

## 职责

单账本模式的库存：可售 / 预占 / 实物 / 安全库存四个科目，预占、确认、出库、释放、调整。
商家持货，平台记账，全平台只有一本账。

## 模块契约

| 方向 | 对象           | 内容                                                                                               |
| ---- | -------------- | -------------------------------------------------------------------------------------------------- |
| 输入 | —              | 不依赖任何业务模块，也不消费事件（`consumes: []`）                                                 |
| 输出 | `trade :: api` | `reserve` / `commit` / `ship` / `release`：预占、确认、出库、释放；库存不足抛 `INSUFFICIENT_STOCK` |
| 输出 | `trade :: api` | `available(skuId)` → 可售量；没有库存行返回 0（"没建过"和"卖光了"对买家是同一件事）                |

**不发事件，也不自己开事务**：所有命令都要求调用方已经在事务里——预占必须和插单同一个事务，
走事件就成了"下单成功了但货没锁住"，那正是超卖的定义。

`available` 允许为负，负值表示账上已经超卖。**调用方不要 clamp 成 0**，那会把异常藏起来。

## 拥有什么

`stock` `reservation` `stock_log`

表都建在 `inventory` schema 里，跨 schema 不 JOIN、不建外键。

不变式、状态机、超时兜底、热点处理见
[inventory.md](../../../../../../../../../docs/domain/inventory.md)。

## 目录

```
inventory/
├── api/         InventoryCommand（同步命令）、InventoryQuery（可售点查）、ReserveRequest
├── service/     InventoryService：唯一写者；ExpiredReservationJob：超时兜底
├── model/       Stock、StockChange、ReservationStatus、StockMoveType、Warehouse
└── mapper/      StockStore、ReservationStore、StockLogStore
```

## 边界

**不发事件，且是库存的唯一写者。** 预占与释放走同事务同步调用；`stock_log` 是账，不是日志。

**下单预占必须同步。** 异步等于"下单成功但货没锁住"，那就是超卖。

**pricing 不查库存，inventory 不碰价格。** 算价是纯函数，库存是可售量；两者混在一起，一次算价就变成了分布式调用。

## 已经落在代码里的三件事

1. **`ck_stock_balance`（`on_hand = available + reserved + safety`）**——守恒式由数据库护栏执行，
   任何漏加可售、重复扣预占、调整总量没同步可售都会当场被拒。实测故意写一个不平的行会被拒。

2. **可售量只走条件更新**——`UPDATE ... WHERE available >= n RETURNING`，影响 0 行就是不够卖。
   实测并发抢同一行，第二次必然 0 行；重复释放同样 0 行。

3. **写顺序固定：幂等闸门 → 改账 → 记流水**，同一事务。`stock_log` 挂只追加触发器，
   实测 UPDATE 被拒（"表 stock_log 是只追加的"）。

## 闭环断点

- **没有对外的 controller**：`available()` 已实现，但详情页/列表页"有货"标记还没接
- **没有 `restock`（退货入库）**：等 `returns` 定了验收在哪一步再接
- **`releaseExpired` 的定时任务默认开**，`shop.inventory.expiry.enabled=false` 可关
- **多仓未做**：`warehouse_id` 全用 `Warehouse.DEFAULT`（全零 UUID）占位
- **批量调整未做**：一次导 5000 行 SKU 的库存，现在只有单条入口

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
