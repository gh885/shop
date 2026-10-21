# returns — 售后

> 核心域 · schema `returns` · 未开工

```yaml
module: returns
layer: 核心域
schema: returns
status: not-started
depends_on: ["trade :: api"]
emits: ["ReturnApproved"]
consumes: ["DisputeResolved"]
```

## 职责

仅退款、退货退款、换货、逆向物流、超时自动处置。

## 拥有什么

`after_sale_case` `case_item` `return_shipment` `case_evidence` `case_log`

表都建在 `returns` schema 里，跨 schema 不 JOIN、不建外键。

三种类型、超时机制、判责规则、退款与结算的联动见
[after-sale.md](../../../../../../../../../docs/domain/after-sale.md)。

## 边界

售后徽标写回订单走 `TradeCommand.syncAfterSaleBadge`。

**三种类型一套状态机**，区别只是"要不要寄回货"这一段，不写三套。

**超时不是一个特例，是一个通用机制。** 每个非终态都带"该谁动 / 什么时候到期 / 到期干什么"三列。

**平台不代收退货运费。** 判责只记录结论，快递费双方线下解决。

**钱只走分录。** 退款不改订单金额，`order_line.refunded_amount` 只是计数器。

## 闭环断点

未开工。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
