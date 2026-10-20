# trade — 交易

> 核心域 · schema `trade` · 未开工

```yaml
module: trade
layer: 核心域
schema: trade
status: not-started
depends_on:
    ["catalog :: api", "pricing :: api", "promotion :: api", "inventory :: api", "trust :: api"]
emits: ["SellerOrderPlaced", "OrderPaid", "OrderCancelled"]
consumes: ["PaymentSucceeded"]
```

## 职责

OrderGroup / SellerOrder、拆单、履约状态机、超时撤销。

## 拥有什么

`order_group` `seller_order` `order_line`

表都建在 `trade` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**不调 `payment`，不调 `clearing`。** 支付入口在 payment，`PaymentSucceeded` 到了 trade 再校验金额；费率模板归 trust，下单时钉快照。反向影响（发货、售后徽标）走 api 命令，不靠监听。

## 闭环断点

未开工。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
