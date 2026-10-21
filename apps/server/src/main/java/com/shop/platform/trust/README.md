# trust — 治理

> 核心域 · schema `trust` · 骨架已落

```yaml
module: trust
layer: 核心域
schema: trust
status: in-progress
depends_on: []
emits: ["MerchantApproved", "SellerSuspended", "CategoryGrantRevoked", "CredentialExpired"]
consumes: ["RiskDecision", "GuaranteeLow"]
```

## 职责

商家分层、类目授权、资质有效期、违规扣分、冻结、**费率模板**。

## 拥有什么

`seller_profile` `category_grant` `brand_grant` `credential` `violation` `enforcement_action` `appeal` `commission_template`

当前落 4 张（`seller_profile` / `category_grant` / `brand_grant` / `credential`），其余用于违规处置与申诉，后续迁移补。

表都建在 `trust` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**能不能卖这个类目只有一个出口。** 费率模板放这里而不是 clearing：佣金率是商业条款，账务只执行不定义。

## 闭环断点

已落最小资格判定：`seller_profile` / `category_grant` / `brand_grant` / `credential` + `TrustQuery.canSell`。
未做：入驻审核、违规处置、申诉、清退、保证金联动。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
