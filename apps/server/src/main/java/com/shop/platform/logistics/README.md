# logistics — 物流

> 支撑域 · schema `logistics` · 未开工

```yaml
module: logistics
layer: 支撑域
schema: logistics
status: not-started
depends_on: ["fulfillment :: api"]
emits: []
consumes: ["OrderPaid"]
```

## 职责

承运商对接、电子面单、轨迹回传。

## 拥有什么

`waybill` `trace_event`

表都建在 `logistics` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

纯技术适配，**不含履约状态机**——状态在 fulfillment 和 trade。

## 闭环断点

未开工。

## 层与依赖

层：支撑域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
