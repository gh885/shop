# invoice — 发票

> 支撑域 · schema `invoice` · 未开工

```yaml
module: invoice
layer: 支撑域
schema: invoice
status: not-started
depends_on: ["clearing :: api"]
emits: []
consumes: ["OrderPaid"]
```

## 职责

电子发票开具、红冲、抬头管理。

## 拥有什么

`invoice` `title`

表都建在 `invoice` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

税务口径独立于账本，两者对不齐是正常的（时间是税期，钱是交易日）。

## 闭环断点

未开工。

## 层与依赖

层：支撑域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
