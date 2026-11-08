# notification — 通知

> 通用域 · schema `notification` · 站内信已落（短信/推送通道未接）

```yaml
module: notification
layer: 通用域
schema: notification
status: in-progress
depends_on:
    ["trade :: events", "payment :: events", "governance :: events", "fulfillment :: events"]
emits: []
consumes:
    [
        "SellerOrderPlaced",
        "ShipmentRecorded",
        "RefundSucceeded",
        "OrderCompleted",
        "SellerSuspended",
        "SellerResumed",
    ]
```

## 职责

站内信（已落）；短信、推送、订阅（未接）。

## 模块契约

### 输入（事件 → 消息）

| 事件                | 收件人   | type                | params                                    | link                           |
| ------------------- | -------- | ------------------- | ----------------------------------------- | ------------------------------ |
| `SellerOrderPlaced` | merchant | `order_placed`      | `{orderGroupId, sellerOrderId}`           | null（卖家界面后补）           |
| `ShipmentRecorded`  | buyer    | `shipment_recorded` | `{orderGroupId, carrierCode, trackingNo}` | `/orders/{orderGroupId}`       |
| `RefundSucceeded`   | buyer    | `refund_succeeded`  | `{orderGroupId, amount, currency}`        | `/orders/{orderGroupId}`       |
| `OrderCompleted`    | buyer    | `order_completed`   | `{}`                                      | `/account/reviews?tab=pending` |
| `SellerSuspended`   | merchant | `seller_suspended`  | `{reason}`                                | null                           |
| `SellerResumed`     | merchant | `seller_resumed`    | `{reason}`                                | null                           |

### 输出

无。notification 没有对外 `api/` 包，不发事件，没有任何模块依赖它——纯叶子。
（消费核心域 `:: events` 不破坏这个声明：叶子指的是「没人依赖我」，不是「我不依赖任何人」。）

## 拥有什么

`message`

表都建在 `notification` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

- **只存 `type` + `params` + `link`，不存文案。** 后端落中文标题，英文用户就永远收到中文消息；
  文案归前端 i18n 模板（`apps/web` 的 `notification.json`），加一种消息 = 加一个枚举值 +
  一个监听方法 + 前端一份模板。自建模板是产品能力，渠道外采——见
  [module-map §4](../../../../../../../../../docs/domain/module-map.md)
- **收件人是 `buyer_id` / `merchant_id` 两列（CHECK 恰一非空）**，不是多态 `recipient_id`——
  归属列按名进 SQL 是 `DataScopeTest` 的判据，多态列会把这条防线架空
- **消息行是产品数据不是事件留痕**：不随 `event_publication` 清理，无保留期任务（近期内不膨胀，
  真到量级再做分区/归档）；买家读恒绑 `buyer_id`、商家读恒绑 `merchant_id`
- **商家消息是主体级的，不是店铺级的**：新订单、店铺处置发给 merchant，授权店铺范围的客服同见
  （与店铺列表同口径）；若未来要按店分盒，加 `shop_id` 列是演进而不是破坏

## 层与依赖

层：通用域。核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。

**一条文档化的层序扩展**：module-map §6 的层图写「通用域 → 平台能力」，而 notification 消费
核心域的 `:: events`。扩展的理由：通知的存在方式就是订阅别人的事实，`:: events` 是纯通知的
公开契约面（过去式、无回查），与「无域 → 只读源模块的 api 与 events」同一性质——
通用域不依赖核心域的 **api**（点查/命令），事件消费不构成对源模块的写路径或读路径耦合。

## 闭环断点

- **短信 / 推送通道未接**：站内信先落，通道是外采适配器（`internal/` + 一个 Channel 接口），
  接的时候加轮子不改监听器
- **频控未做**：站内信由业务事件驱动，一单一信，天然频控；做营销触达时频控才是必需品
- **`subscription` 表未建**：订阅（退订关系）是营销通道的能力，站内信全量投递不需要它
- **商家侧无界面**：`/api/seller/notifications` 四个接口已备，seller 端铃铛待接
