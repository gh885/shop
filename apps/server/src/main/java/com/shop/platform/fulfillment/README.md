# fulfillment — 履约

> 核心域 · schema `fulfillment` · 未开工

```yaml
module: fulfillment
layer: 核心域
schema: fulfillment
status: not-started
depends_on: ["trade :: api"]
emits: []
consumes: ["OrderPaid"]
```

## 职责

包裹、发货时效、自提、同城配送。

## 拥有什么

`package` `ship_task` `delivery_slot`

表都建在 `fulfillment` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

发货写回订单走 `TradeCommand.recordShipment`，不直接改订单表。

## 闭环断点

未开工。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
