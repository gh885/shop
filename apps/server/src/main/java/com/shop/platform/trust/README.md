# trust — 治理

> 核心域 · schema `trust` · 未开工

```yaml
module: trust
layer: 核心域
schema: trust
status: not-started
depends_on: []
emits: ["MerchantApproved", "SellerSuspended", "CategoryGrantRevoked", "CredentialExpired"]
consumes: ["RiskDecision", "GuaranteeLow"]
```

## 职责

商家分层、类目授权、资质有效期、违规扣分、冻结、**费率模板**。

## 拥有什么

`seller_profile` `category_grant` `brand_grant` `credential` `violation` `enforcement_action` `appeal` `commission_template`

表都建在 `trust` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**能不能卖这个类目只有一个出口。** 费率模板放这里而不是 clearing：佣金率是商业条款，账务只执行不定义。

## 闭环断点

未开工。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
