# trade — 交易

> 核心域 · schema `trade` · 进行中

```yaml
module: trade
layer: 核心域
schema: trade
status: in-progress
depends_on:
    ["catalog :: api", "pricing :: api", "inventory :: api", "payment :: api", "trust :: api"]
emits: ["SellerOrderPlaced", "OrderPaid", "OrderCancelled", "OrderCompleted", "RefundRequested"]
consumes: ["PaymentSucceeded"]
```

## 职责

OrderGroup / SellerOrder、拆单、履约状态机、超时撤销。

## 模块契约

### 输入

| 来源               | 拿什么                                                            | 用在哪             | 拿不到会怎样                                               |
| ------------------ | ----------------------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| `pricing :: api`   | `consumeForOrder(quoteId, current)` → `QuoteSnapshot`             | 落单               | 过期抛 `QUOTE_EXPIRED`、对不上抛 `PRICE_CHANGED`，整单回滚 |
| `inventory :: api` | `reserve(...)`                                                    | 落单同事务         | 库存不足抛 `INSUFFICIENT_STOCK`，整单回滚                  |
| `payment :: api`   | `create(orderGroupId, buyerId, amount, currency)` → `PaymentView` | 买家发起支付       | 渠道不可用就发不起来，订单停在待付款                       |
| 事件               | `PaymentSucceeded` / `RefundSucceeded`                            | 回写支付与退款状态 | 收不到就一直显示待付款                                     |

### 输出

| 消费方               | 给什么                                                                                      | 什么时候               |
| -------------------- | ------------------------------------------------------------------------------------------- | ---------------------- |
| `fulfillment :: api` | `findShippable(sellerOrderId)` → `Shippable`；`recordShipment(...)` 回写                    | 发货前校验、发货后回写 |
| 事件                 | `SellerOrderPlaced` / `OrderPaid` / `OrderCancelled` / `OrderCompleted` / `RefundRequested` | 状态变化时             |

### 边界

- **金额只从报价单读**：`placeOrder` 收 `quoteId`，不收金额。让调用方传钱，等于允许别处编一个数字去下单
- **不直接写别人的表**：发货回写走 `TradeCommand.recordShipment`，库存走 `InventoryCommand`，
  报价单置 used 走 `pricing.consumeForOrder`——`trade` 自己的 mapper 只碰 `trade` schema

## 拥有什么

`order_group` `seller_order` `order_line` `order_line_discount` `order_event`

表都建在 `trade` schema 里，跨 schema 不 JOIN、不建外键。

三层结构、状态维度、快照厚度、超时竞态见
[order-model.md](../../../../../../../../../docs/domain/order-model.md)。

## 目录

```
trade/
├── controller/  BuyerOrderController：落单 / 取消 / 详情 / 列表
├── dto/         CreateOrderRequest（HTTP 入参，不含任何金额）
├── api/         TradeCommand、TradeQuery、PlaceOrderRequest
├── service/     TradeService（落单与状态迁移）、TradeQueryService、
│                BuyerOrderQuery（买家读模型）、PaymentSucceededHandler
├── mapper/      OrderGroupStore、SellerOrderStore、OrderLineStore、
│                OrderEventStore、BuyerOrderReadStore
├── model/       PaymentStatus、CloseReason
└── events/      SellerOrderPlaced、OrderPaid、OrderCompleted
```

## HTTP 入口

| 方法   | 路径                      | 说明                                   |
| ------ | ------------------------- | -------------------------------------- |
| `POST` | `/api/orders`             | 落单，带 `quoteId`，**不接受任何金额** |
| `POST` | `/api/orders/{id}/cancel` | 未付款时取消整单                       |
| `GET`  | `/api/orders/{id}`        | 详情，三层一次返回                     |
| `GET`  | `/api/orders?limit=`      | 我的订单，走主库不走索引               |

包裹相关（看包裹、确认收货）在 `fulfillment` 的 controller 里，路径同样挂在 `/api/orders` 下。

`buyerId` 一律从令牌来，请求体里没有这个字段——让前端传就等于允许替别人下单。

不是自己的订单统一返回 **404 而不是 403**：告诉对方"这个 id 存在但不是你的"，
本身就是一次信息泄露，拿它当枚举器就能确认哪些订单号真实存在。

## 已经落在代码里的五件事

1. **三层各管一个维度。** `order_group` 只有支付和关闭，`seller_order` 管履约和结算，`order_line` 管快照和计数器。
   **订单组上没有履约状态**——三个子单一个已签收一个部分发货，group 是哪个？说不清。

2. **关闭是独立的一列，不是支付状态的值。** 未付款取消不用退钱，已付款关闭要记冲正；塞进同一个枚举，
   付款状态就说不清，而且 CAS 条件、展示态、事件触发者会各写一套。

3. **落单全链路一个事务**：校验报价（CAS 置 used）→ 定子单 id → 占库存 → 插三层 → 发事件。
   实测库存不足时，订单一张都不落、报价仍是 `issued`（没被烧掉）、库存没被扣。

4. **取消与超时共用一个前置条件**：`WHERE payment_status='unpaid' AND closed_at IS NULL`，
   谁改到行谁赢。实测先取消后再关单，影响 0 行。

5. **取消要写两个维度**：先子单、再组，同一事务。只写组的话子单还开着，
   买家页和商家页会显示两个状态。

## 库约束（已实测生效）

- `ck_group_amount` / `ck_seller_amount`：三层金额各自对平
- `ck_group_close`：`closed_at` 与 `close_reason` 同生同死
- `uq_order_group_quote`：同一张报价只能下一单，实测第二单必失败
- `ck_line_sub` / `ck_line_pay` / `ck_line_cancel` / `ck_line_refund` / `ck_line_cnt`：行金额与计数器
- `order_event` 挂只追加触发器，实测 UPDATE 被拒

## 闭环断点

- **退款事件没人消费**：`RefundSucceeded` 的消费者没写，所以退款退不回来
- **没有超时调度**：`closeExpired` 有，但没接 `@Scheduled` 扫部分索引
- **费率没接 trust**：`order_line.commission_rate_bp` 现在落 0，等 trust 的费率模板接口
- **部分取消没做**：现在只能取消整单，`cancelled_qty` 那套计数器还没有写入路径
- **`OrderCompleted` 没人消费**：事件发了，`clearing` 和 `review` 都还没接
- **确认收货完全靠买家手动点**：自动确认（`delivered_at` + N 天）要等 `fulfillment` 的轨迹回写

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
