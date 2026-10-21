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

单账本模式的库存：可售 / 预占 / 实物 / 安全库存四个科目，预占与释放。

## 拥有什么

`stock` `reservation` `stock_log`

表都建在 `inventory` schema 里，跨 schema 不 JOIN、不建外键。

不变式、状态机、超时兜底、热点处理见
[inventory.md](../../../../../../../../../docs/domain/inventory.md)。

## 边界

**不发事件，且是库存的唯一写者。** 预占与释放走同事务同步调用；`stock_log` 是账，不是日志。

**商家持货，平台记账。** 平台不接商家 ERP，商家在后台自己改数字——单账本不需要跨系统对账。

**下单预占必须同步。** 异步等于"下单成功但货没锁住"，那就是超卖。

## 闭环断点

未开工。库存表的分桶形状要在建表那天定，事后改要迁数据。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
