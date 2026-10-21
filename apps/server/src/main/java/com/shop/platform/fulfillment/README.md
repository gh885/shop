# fulfillment — 履约

> 核心域 · schema `fulfillment` · 未开工

```yaml
module: fulfillment
layer: 核心域
schema: fulfillment
status: not-started
depends_on: ["trade :: api", "trust :: api"]
emits: []
consumes: ["OrderPaid"]
```

## 职责

包裹、拆包、发货时效、轨迹状态机（只认八个标准码）。

## 拥有什么

`package` `package_item` `ship_task`

表都建在 `fulfillment` schema 里，跨 schema 不 JOIN、不建外键。

状态机、标准码、超时检测见
[fulfillment.md](../../../../../../../../../docs/domain/fulfillment.md)。

## 边界

发货写回订单走 `TradeCommand.recordShipment`，不直接改订单表。

**只认标准码，不认承运商码。** 上千种原始码由 `logistics` 翻译，认不出的记为 `unknown`，绝不猜。

**检测在这里，处置在 `trust`。** 超时、虚假发货、停滞都由本模块发现，扣多少分是治理的事。

**确认收货是 `trade` 的动作。** 这里只提供"签收时间"这个事实。

## 闭环断点

未开工。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
