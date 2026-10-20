# inventory — 库存

> 核心域 · schema `inventory` · 未开工

```yaml
module: inventory
layer: 核心域
schema: inventory
status: not-started
depends_on: []
emits: []
consumes: ["OrderCancelled"]
```

## 职责

多仓 / 门店 / 预售 / 共享库存，ATP 与预占。

## 拥有什么

`stock` `reservation` `stock_log`

表都建在 `inventory` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**不发事件，且是库存的唯一写者。** 预占与释放走同事务同步调用；`stock_log` 是账，不是日志。

## 闭环断点

未开工。库存表的分桶形状要在建表那天定，事后改要迁数据。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
