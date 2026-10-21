# funding — 资金方

> 支撑域 · schema `funding` · 未开工

```yaml
module: funding
layer: 支撑域
schema: funding
status: not-started
depends_on: ["seller :: api", "clearing :: api"]
emits: ["GuaranteeLow"]
consumes: ["SellerOrderPlaced"]
```

## 职责

保证金、账期、授信、商家贷。

## 拥有什么

`guarantee_account` `guarantee_txn` `credit_line` `loan`

表都建在 `funding` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**资金方的债权，不进交易账本。** 混进去之后对账永远差一笔。

## 闭环断点

未开工。

## 层与依赖

层：支撑域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
