# member — 会员

> 支撑域 · schema `member` · 未开工

```yaml
module: member
layer: 支撑域
schema: member
status: not-started
depends_on: ["account :: api"]
emits: []
consumes: ["OrderPaid"]
```

## 职责

等级、积分、权益、会员价资格。

## 拥有什么

`member_profile` `point_ledger`

表都建在 `member` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**只产出资格，不参与算价。** 会员价怎么算是 pricing 的事。

## 闭环断点

未开工。

## 层与依赖

层：支撑域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
