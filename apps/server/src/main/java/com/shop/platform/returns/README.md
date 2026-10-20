# returns — 售后

> 核心域 · schema `returns` · 未开工

```yaml
module: returns
layer: 核心域
schema: returns
status: not-started
depends_on: ["trade :: api"]
emits: ["ReturnApproved"]
consumes: []
```

## 职责

仅退款、退货退款、换货、逆向物流。

## 拥有什么

`after_sale_case` `return_shipment`

表都建在 `returns` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

售后徽标写回订单走 `TradeCommand.syncAfterSaleBadge`。

## 闭环断点

未开工。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
