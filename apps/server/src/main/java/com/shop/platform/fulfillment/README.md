# fulfillment — 履约

> 核心域 · schema `fulfillment` · 进行中

```yaml
module: fulfillment
layer: 核心域
schema: fulfillment
status: in-progress
depends_on: ["trade :: api", "trade :: events", "trust :: api"]
emits: []
consumes: ["OrderPaid"]
```

## 职责

包裹、拆包、发货时效、轨迹状态机（只认八个标准码）。

## 模块契约

| 方向 | 对象           | 内容                                                                                   |
| ---- | -------------- | -------------------------------------------------------------------------------------- |
| 输入 | `trade :: api` | `findShippable(sellerOrderId)` → `Shippable`：每行还剩多少可发、是否已付款、是否已关闭 |
| 输入 | `trade :: api` | `recordShipment(...)`：发货数量写回订单行计数器（在自己的事务里调，**不是事件**）      |
| 输入 | 事件           | `OrderPaid`                                                                            |
| 输出 | —              | 目前没有模块调它；商家发货、买家查包裹都走 HTTP。**不发事件**（`emits: []`）           |

**发几件必须问 trade，不能信前端传的数量**——超发就是超卖。反过来也不许直接改 `trade` 的表。

**确认收货只提供"包裹签收了"这个事实**，订单的完成态由 `trade` 从行重算——两边各算一次必然对不上。

## 拥有什么

`package` `package_item` `ship_task`

表都建在 `fulfillment` schema 里，跨 schema 不 JOIN、不建外键。

状态机、标准码、超时检测见
[fulfillment.md](../../../../../../../../../docs/domain/fulfillment.md)。

## 目录

```
fulfillment/
├── controller/  SellerShipmentController（卖家发货 / 查包裹）、
│                BuyerShipmentController（买家看包裹 / 确认收货）
├── dto/         ShipRequest
├── api/         FulfillmentCommand（发货 / 签收 / 查包裹）
├── service/     FulfillmentService（发货与签收）、OrderPaidHandler（建发货任务）
├── mapper/      PackageStore、ShipTaskStore
└── model/       PackageStatus
```

## 边界

发货写回订单走 `TradeCommand.recordShipment`，不直接改订单表。

**只认标准码，不认承运商码。** 上千种原始码由 `logistics` 翻译，认不出的记为 `unknown`，绝不猜。

**检测在这里，处置在 `trust`。** 超时、虚假发货、停滞都由本模块发现，扣多少分是治理的事。

**确认收货是 `trade` 的动作。** 这里只提供"签收时间"这个事实。

## 发货的三道校验

顺序不能换，全部在建包裹之前：

1. **子单属于这个商家** —— 不属于返回 404 不是 403（403 等于确认"这个子单存在但不是你的"）
2. **已付款且未关闭** —— 未付款的订单发货等于白送
3. **逐行不超过剩余可发** —— 剩余量由 `TradeQuery.findShippable` 算（`quantity - shipped_qty`），
   **不让 fulfillment 自己减**：超发就是超卖，而"还剩多少能发"只有持有计数器的 trade 能做对

任何一条不过就整次回滚，不留包裹、不留明细、不动订单计数器。

## 拆包

`package_item` 就是拆包的全部表达：一行拆两包是两条记录，两行装一包也是两条记录。
**平台不替商家决定拆几个包裹**，只要求每个包裹能追溯到订单行和数量。

实测：一单 3 件分两次发（2 + 1），第一次后子单 `partial_shipped`、第二次后 `shipped`。

## 签收与交易完成

一个商家单可以发多个包裹，每个包单独签收。**全部包裹都签收后**订单才置 `received`，
这时 `trade` 发 `OrderCompleted`。

实测：签收 2/3 时子单仍是 `shipped`（不能提前 `received`），签完剩下 1 件才变 `received`，
同时落一条 `order_event`（`dimension=fulfillment, to_value=completed`）。

**完成不写 `closed_at`。** 已完成订单还要走售后和结算，给它一个关闭时间会让展示态变成"已取消"。

## 库约束（已实测生效）

- `uq_package_tracking`（partial）：同一运单号不能挂两个包裹，实测第二次被拒且整次回滚
- `ck_package_tracking_required`：除 `created` / `cancelled` 外必须有承运商和运单号
- `ck_package_delivered`：`status = 'delivered'` 与 `delivered_at` 非空必须同生同死
- `uq_ship_task_order`：一个商家单一条发货任务
- `ck_package_item_qty`：包裹明细数量必须为正

## 闭环断点

- **没有轨迹回写**：`recordTrace` 没做，要 `logistics` 先落地（认标准码那层）。
  所以现在**签收只能靠买家点"确认收货"**——没有物流对接时这是唯一出路，代价是买家能提前说自己收到了
- **没有时效检测**：`ship_task` 建了但没人扫 `due_at`，超时不会置 `overdue`。
  检测本身简单，卡在它要报违规线索给 `trust`，而 trust 还没有接收线索的接口
- **承运商没有白名单**：`carrier_code` 是自由字符串，商家填错就查不到轨迹
- **没有自动确认收货**：`delivered_at` 之后 N 天自动确认没做，现在完全靠买家手动点
- **没有虚假发货检测**：只看有没有运单号，没看 24 小时内有没有揽收轨迹
- **`OrderCompleted` 没人消费**：`clearing` 和 `review` 都还没接

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。

**依赖是单向的：`fulfillment → trade :: api`，反过来没有。**

一开始把买家侧的"看包裹 / 确认收货"放在 trade 的 controller 里，理由是归属校验 trade 已经做完了。
`modules:check` 当场报环：`trade → fulfillment → trade`。那个判断是错的——归属校验可以搬家，环搬不了。

现在归属链路「包裹 → 子单 → 订单组 → 买家」住在这里，因为它知道包裹属于哪个子单，trade 不知道。
