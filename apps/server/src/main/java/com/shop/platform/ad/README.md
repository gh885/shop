# ad — 广告

> 支撑域 · schema `ad` · 未开工

```yaml
module: ad
layer: 支撑域
schema: ad
status: not-started
depends_on: ["clearing :: api"]
emits: []
consumes: ["OrderPaid"]
```

## 职责

广告位、竞价、计费、效果归因。

## 拥有什么

`ad_slot` `bid` `billing`

表都建在 `ad` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

计费结果进 `clearing`，**不反向写订单**。

## 闭环断点

未开工。成熟平台的主要营收，但边界清楚，可以最后做。

## 层与依赖

层：支撑域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
