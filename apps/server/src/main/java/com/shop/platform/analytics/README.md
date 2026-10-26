# analytics — 数据分析

> 无域（读侧投影）· schema `analytics` · 未开工

```yaml
module: analytics
layer: 无域
schema: analytics
status: not-started
depends_on: []
emits: []
consumes: []
```

## 职责

报表、漏斗、商家看板。

## 拥有什么

`report_snapshot` `metric_daily`

表都建在 `analytics` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**只消费事件，不产生业务写入。** 它的库挂了不能影响下单。

## 闭环断点

未开工。消费事件清单同样没定，理由同 notification。

## 层与依赖

层：通用域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
