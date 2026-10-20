# payment — 支付

> 支撑域 · schema `payment` · 未开工

```yaml
module: payment
layer: 支撑域
schema: payment
status: not-started
depends_on: []
emits: ["PaymentSucceeded", "PaymentFailed", "RefundSucceeded", "ChannelSplitSettled"]
consumes: ["ReturnApproved"]
```

## 职责

支付单、渠道聚合、回调、退款、渠道分账单。

## 拥有什么

`payment_order` `refund_order` `channel_bill`

表都建在 `payment` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**不做分账计算，只认「钱到账」这一事实。** 分给谁、分多少是 clearing 的事。

## 闭环断点

未开工。它是资金闭环的入口——不做这个，账本永远只有测试在写。

## 层与依赖

层：支撑域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
