# fulfillment — 履约

> 核心域 · schema `fulfillment` · 进行中

```yaml
module: fulfillment
layer: 核心域
schema: fulfillment
status: in-progress
depends_on:
    ["trade :: api", "trade :: events", "governance :: api", "inventory :: api", "returns :: api"]
emits: []
consumes: ["OrderPaid"]
```

## 职责

包裹、拆包、发货时效、轨迹状态机（只认八个标准码）。

## 模块契约

| 方向 | 对象                 | 内容                                                                                                                                                                        |
| ---- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 输入 | `trade :: api`       | `findShippable(sellerOrderId)` → `Shippable`：每行还剩多少可发、是否已付款、是否已关闭                                                                                      |
| 输入 | `trade :: api`       | `recordShipment(...)`：发货数量写回订单行计数器（在自己的事务里调，**不是事件**）                                                                                           |
| 输入 | `inventory :: api`   | `ship(ShipRequest)`：出库，预占减、实物减。**幂等锚点是包裹 id**，不是子单——一个子单分多包发时同一行会出库多次                                                              |
| 输入 | `returns :: api`     | `openCaseOrderIds(sellerOrderIds)`：这批子单里哪些挂着未终态售后。自动收货任务据此避让——货还在扯皮就不替买家签收（拿不到会怎样：查不到=全部照常签收）                       |
| 输入 | 事件                 | `OrderPaid`                                                                                                                                                                 |
| 输出 | `fulfillment :: api` | `logistics` 调 `findByTrackingNo` / `findByPackageNo` / `findBySellerOrder*`（把运单号、包裹号、子单换成包裹视图）与 `recordTrace`（轨迹回写）。**不发事件**（`emits: []`） |
| 输出 | `fulfillment :: api` | `Carriers`：承运商白名单与 `normalize`。**写入与按承运商查都过它**，两边各写一遍小写转换迟早有一边漏掉                                                                      |

**发几件必须问 trade，不能信前端传的数量**——超发就是超卖。反过来也不许直接改 `trade` 的表。

**发货必须同时扣库存。** 只写回订单计数器而不同步出库，`on_hand` 与 `reserved` 就再也不会动，
账面上永远"货还在仓库里"。出库放在包裹落库之后调：`packageId` 就是这次出库的幂等锚点。

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
├── api/         FulfillmentCommand（发货 / 签收 / 查包裹）、StandardTraceCode（八个标准码）、
│                Carriers（承运商白名单 + 码归一化）
├── service/     FulfillmentService（发货与签收）、OrderPaidHandler（建发货任务）、
│                AutoReceiveJob（到期自动确认收货）、ShipDeadlineJob（发货超时检测）
├── mapper/      PackageMapper、ShipTaskMapper
└── model/       PackageStatus
```

## 边界

发货写回订单走 `TradeCommand.recordShipment`，不直接改订单表。

**只认标准码，不认承运商码。** 上千种原始码由 `logistics` 翻译，认不出的记为 `unknown`，绝不猜。

**检测在这里，处置在 `governance`。** 超时、虚假发货、停滞都由本模块发现，扣多少分是治理的事。

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

签收有三条路，走**同一条写路径**（CAS 置 delivered + 回写订单行），谁先到谁赢：

- 买家手点「确认收货」——`delivered_source = 'buyer'`。没有轨迹时买家能提前说自己收到了，
  这是唯一出路，也是已知取舍
- 系统到期自动确认（`AutoReceiveJob`，每小时扫表）——发货后 10 天（可配
  `shop.fulfillment.auto-receive.after`）还没签收的包裹逐包替买家签，`delivered_source = 'system'`。
  没有它，买家不点、订单永远停在 `shipped`、商家的钱冻在 clearing 的 pending 里解冻不了。
  扫描是状态驱动的：错过一轮的包裹还在扫描面里，下一轮照扫，自愈；
  跑没跑、跑了多少由 `shop.job.*` 指标回答，管理端 `/api/admin/jobs` 可手动触发
- 承运商轨迹签收（`logistics` 回写 `delivered` 标准码）——`delivered_source = 'trace'`，
  翻译在 logistics，这里只认八个标准码（`StandardTraceCode`），状态单调只升不降

**完成不写 `closed_at`。** 已完成订单还要走售后和结算，给它一个关闭时间会让展示态变成"已取消"。

## 库约束（已实测生效）

- `uq_package_tracking`（partial）：同一运单号不能挂两个包裹，实测第二次被拒且整次回滚
- `ck_package_tracking_required`：除 `created` / `cancelled` 外必须有承运商和运单号
- `ck_package_delivered` / `ck_package_delivered_pairing`：`status = 'delivered'` 与
  `delivered_at`、`delivered_source` 同生同死——签了收就必须答得出"谁确认的"
- `uq_ship_task_order`：一个商家单一条发货任务
- `ck_package_item_qty`：包裹明细数量必须为正

## 发货的承运商白名单

承运商码必须是 `api/Carriers` 白名单里的九家（顺丰/EMS/三通一达/极兔/京东/德邦），大小写不敏感，
填错当场 400 并附全部可选码。没有它，一个拼错的 `carrier_code` 会挂着一个永远查不到轨迹的运单，
直到买家投诉才发现。接真渠道时码表要和轨迹服务的承运商编码对齐，那时再变成数据。

**落库的一律是小写**（`Carriers.normalize`）。这里的"大小写不敏感"不只是校验宽松：推送方发的是
哪一档大小写不受我们控制，而定位包裹是 `carrier_code = ?` 精确匹配。不归一化的话，商家录 `SF`、
渠道推 `sf`，这个运单就永远查不到轨迹——而且只有买家投诉时才暴露。`uq_package_tracking` 也需要
它：`SF` 和 `sf` 若各存一份，同一运单就能挂两个包裹。

## 闭环断点

- **轨迹链路已落地但没有真实推送方**：`recordTrace` 状态机与 `logistics` 推送口都通、
  测试过；`carrier_code_map` 为空、没有承运商在推，所以生产上包裹仍只能靠买家手点和到期
  自动确认推进到 `delivered`——都不是物流事实。**自动确认不判"有没有未决售后"**——
  买家已申请仅退款时订单照样完成，退款从商家可用余额扣（商家欠平台 ≠ 买家收不到货），
  真渠道接上、轨迹成为签收主来源后这里要重看
- **时效检测做了一档**：`ShipDeadlineJob` 每小时扫 `ship_task`，承诺时间（付款 + 48h）过了
  还没发的置 `overdue` 并把线索报给 governance（管理端 `GET /api/admin/governance/clues`，只读）；
  订单已关闭、未发货就全额退款的两类作废任务，不报违规。**虚假发货与停滞检测没做**——
  两个都要看揽收/轨迹事实，没有真实推送方时检测出来全是假阳性
- **没有虚假发货检测**：承运商码过了白名单、运单号格式对，但 24 小时内有没有揽收轨迹没人看
- **`OrderCompleted` 的 review 消费者还没接**：clearing 已接（解冻商家净额走它），
  买家评价入口还开不了

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。

**依赖是单向的：`fulfillment → trade :: api`，反过来没有。**

一开始把买家侧的"看包裹 / 确认收货"放在 trade 的 controller 里，理由是归属校验 trade 已经做完了。
`modules:check` 当场报环：`trade → fulfillment → trade`。那个判断是错的——归属校验可以搬家，环搬不了。

现在归属链路「包裹 → 子单 → 订单组 → 买家」住在这里，因为它知道包裹属于哪个子单，trade 不知道。
