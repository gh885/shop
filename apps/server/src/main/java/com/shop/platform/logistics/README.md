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

承运商轨迹回传，把上千种原始轨迹码翻译成八个标准码。

## 拥有什么

`trace_event` —— 每条原始轨迹一行，同时存翻译后的标准码

表都建在 `logistics` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

纯技术适配，**不含履约状态机**——状态在 `fulfillment` 和 `trade`。

**认不出的码记 `unknown`，不猜。** 猜错会把"退签"当"签收"，直接触发结算。

电子面单不做，MVP 由商家自己打单填运单号。

## 闭环断点

未开工。

## 层与依赖

层：支撑域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
