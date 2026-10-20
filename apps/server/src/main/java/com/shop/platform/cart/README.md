# cart — 购物车

> 支撑域 · schema `cart` · 未开工

```yaml
module: cart
layer: 支撑域
schema: cart
status: not-started
depends_on: ["catalog :: api", "pricing :: api"]
emits: []
consumes: ["OrderPaid"]
```

## 职责

购物车、凑单、失效标记。

## 拥有什么

`cart_item`

表都建在 `cart` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**只存选购意图，不锁价不锁库存。** 一锁就变成第二份库存。

## 闭环断点

未开工。

## 层与依赖

层：支撑域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
