# promotion — 营销活动

> 核心域 · schema `promotion` · 只有 api 契约

```yaml
module: promotion
layer: 核心域
schema: promotion
status: in-progress
depends_on: ["catalog :: api"]
emits: []
consumes: []
```

> **只有 api 契约，没有实现。** `AppliedRule` / `PromotionQuery` 已定，pricing 按它算优惠；
> 但规则表、券生命周期一条都没做，`NoPromotionRules` 现在返回空列表——算价只会算出原价 + 运费。
> README 标 `in-progress` 而不是 `not-started`，是因为接口形状已经压在依赖方身上了，不算"没开工"。

## 职责

券、满减、秒杀、拼团、预售的活动定义与额度。
**规则数据归这里，算价不归这里**——`pricing` 通过 `api` 取生效规则，自己算。

## 拥有什么

`campaign` `promotion_rule` `coupon_stock` `coupon_instance`

表都建在 `promotion` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**不发事件。** 券占用和核销走同事务同步调用；广播只会制造「占用成功但订单已取消」的竞态。

## 闭环断点

未开工。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
