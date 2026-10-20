# review — 评价

> 支撑域 · schema `review` · 未开工

```yaml
module: review
layer: 支撑域
schema: review
status: not-started
depends_on: ["catalog :: api"]
emits: []
consumes: ["OrderPaid"]
```

## 职责

评价、追评、问大家、买家秀。

## 拥有什么

`review` `qa`

表都建在 `review` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

UGC。聚合分回给 `catalog` 当排序输入，不反向改商品。

## 闭环断点

未开工。

## 层与依赖

层：支撑域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
