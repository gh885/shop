# pricing — 算价

> 核心域 · schema `pricing` · 未开工

```yaml
module: pricing
layer: 核心域
schema: pricing
status: not-started
depends_on: ["catalog :: api", "member :: api"]
emits: ["PriceRulePublished"]
consumes: []
```

## 职责

活动价、会员价、阶梯价、平台补贴叠加，输出成交价与优惠分摊。

## 拥有什么

`price_rule` `calc_trace`

表都建在 `pricing` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**算价只有 pricing 算。** 其他模块不许自己乘除折扣，不许复制优惠叠加规则。算完把过程留在 `calc_trace` 里，否则「为什么是这个价」永远查不清。

## 闭环断点

未开工。当前没有任何东西在算价。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
