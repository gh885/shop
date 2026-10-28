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

单账本模式的库存：可售 / 预占 / 实物 / 安全库存四个科目，预占、确认、出库、释放、回补、调整。
商家持货，平台记账，全平台只有一本账。

## 模块契约

| 方向 | 对象                 | 内容                                                                                                 |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| 输入 | —                    | 不依赖任何业务模块，也不消费事件（`consumes: []`）                                                   |
| 输出 | `trade :: api`       | `reserve` / `commitAll` / `releaseAll`：预占、确认、释放；库存不足抛 `INSUFFICIENT_STOCK`            |
| 输出 | `fulfillment :: api` | `ship(ShipRequest)`：出库，**幂等锚点是 `packageId`**——一个子单分多包发时同一行会出库多次            |
| 输出 | `returns :: api`     | `restock(RestockRequest)`：退货入库，实物加、可售加；幂等锚点是 `rmaCaseId`                          |
| 输出 | `catalog :: api`     | `adjustAll(AdjustRequest)` / `stockAccounts(...)`：商家改库存（批量、带 `requestId` 幂等键）与库存页 |
| 输出 | `catalog :: api`     | `availableToPromise(skuId)` / `availableToPromiseByIds` / `availableAcrossWarehouses`                |

**不发事件，也不自己开事务**：所有命令都要求调用方已经在事务里——预占必须和插单同一个事务，
走事件就成了"下单成功了但货没锁住"，那正是超卖的定义。

**两个可售量口径，名字里就分开**：`availableToPromise*` 只看默认仓（交易口径，下单只从那发货），
`availableAcrossWarehouses` 跨仓求和（商家口径，「我还有多少货」）。合并成一个方法就会在错误的场景
拿到一个"正确的"数字。

`availableToPromise` 允许为负，负值表示账上已经超卖。**调用方不要 clamp 成 0**，那会把异常藏起来。

**库存的唯一写入口是 `adjustAll`，不是 `UPDATE stock`。** 直接改数字会绕开 `ck_stock_balance`，也会让流水断掉。

## 拥有什么

`stock` `reservation` `stock_ledger`

表都建在 `inventory` schema 里，跨 schema 不 JOIN、不建外键。

不变式、状态机、超时兜底、热点处理见
[inventory.md](../../../../../../../../../docs/domain/inventory.md)。

## 目录

```
inventory/
├── api/         InventoryCommand（同步命令）、InventoryQuery（可售点查）、ReserveRequest / ShipRequest / RestockRequest / AdjustRequest
├── service/     InventoryService：唯一写者；ExpiredReservationJob：超时兜底；InventoryAuditJob：日检
├── model/       Stock、StockChange、ReservationStatus、StockMoveType、Warehouse
└── mapper/      StockMapper、ReservationMapper、StockLedgerMapper、InventoryAuditMapper
```

## 边界

**不发事件，且是库存的唯一写者。** 预占、释放、出库回补走同事务同步调用；`stock_ledger` 是账，不是日志。

**下单预占必须同步。** 异步等于"下单成功但货没锁住"，那就是超卖。

**pricing 不查库存，inventory 不碰价格。** 算价是纯函数，库存是可售量；两者混在一起，一次算价就变成了分布式调用。

**归属不在 inventory 判。** 它只认数字、不认「这个 SKU 是谁的」——那需要 `catalog`，而 `catalog` 已经依赖
`inventory :: api`，反向依赖成环。所以商家改库存的入口长在 `catalog`（`SellerStockService`），
它判完归属再把数字交过来。

## 已经落在代码里的四件事

1. **`ck_stock_balance`（`on_hand = available_to_promise + reserved + safety`）**——守恒式由数据库护栏执行，
   任何漏加可售、重复扣预占、调整总量没同步可售都会当场被拒。`InventoryLedgerTest` 实测故意写不平会被拒。

2. **可售量只走条件更新**——`UPDATE ... WHERE available_to_promise >= n RETURNING`，影响 0 行就是不够卖。
   `InventoryLedgerTest` 实测 200 并发抢 100 件，恰好成功 100 次。

3. **写顺序固定、两套**：预占是「闸门 → 改账 → 记流水」；出库和回补是「锁行 → 记流水 → 改账 → 推进预占」。
   两套不同是因为 `stock_ledger` 的 before/after 只能在改账之后才有真值。
   `stock_ledger` 挂只追加触发器，实测 UPDATE 被拒。

4. **出库按包裹幂等**——`ship:{packageId}:{lineNo}`。同一包裹重放是空操作，第二个包裹是一次新的出库；
   `reservation.shipped_quantity` 记已出库件数，发完才转 `consumed`。

## 闭环断点

- **多仓未做**：`warehouse_id` 全用 `Warehouse.DEFAULT`（全零 UUID）占位
- **商家库存页的前端未做**：接口（`GET/PUT /api/seller/products/{spuId}/stock`）在，
  `apps/seller` 侧 `/product/stock` 还是占位页
- **批量调整失败明细**：现在整批一个事务，失败即全回滚。一次导 5000 行时商家可能想要"错的那几行挑出来"
- **`releaseExpired` 的定时任务默认开**，`shop.inventory.expiry.enabled=false` 可关；日检同理（`shop.inventory.audit.enabled`）

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
