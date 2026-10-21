# pricing — 算价

> 核心域 · schema `pricing` · 未开工

```yaml
module: pricing
layer: 核心域
schema: pricing
status: not-started
depends_on: ["catalog :: api", "promotion :: api"]
emits: []
consumes: []
```

## 职责

取 `promotion` 的生效规则，按五层流水线算出成交价：基础价、优惠、分摊、运费、证据。
单体打折与满减的执行逻辑在这里；**规则数据不在这里**——活动定义归 `promotion`。
会员价、阶梯价、券暂不做。

## 拥有什么

`shipping_template` `price_quote` `price_quote_line` `price_quote_rule` `price_quote_shipping`

表都建在 `pricing` schema 里，跨 schema 不 JOIN、不建外键。

完整五层模型、分摊算法、承担方规则见
[pricing.md](../../../../../../../../../docs/domain/pricing.md)。

## 边界

**算价只有 pricing 算。** 其他模块不许自己乘除折扣，不许复制优惠叠加规则。算完把过程留在 `price_quote` 里，否则「为什么是这个价」永远查不清。

**pricing 不查库存。** 可售性和库存在 `trade` 的下单事务里校验；算价去查库存，一个纯函数就变成了分布式调用。

## 闭环断点

未开工。当前没有任何东西在算价。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
