# ticket — 客服工单

> 通用域 · schema `ticket` · 未开工

```yaml
module: ticket
layer: 通用域
schema: ticket
status: not-started
depends_on: []
emits: []
consumes: []
```

## 职责

客服工单、流转、SLA。

## 拥有什么

`ticket` `ticket_event`

表都建在 `ticket` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

可外采。与 `dispute` 的分界：工单是「有人问」，纠纷是「有裁决」。

## 闭环断点

未开工。

## 层与依赖

层：通用域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
