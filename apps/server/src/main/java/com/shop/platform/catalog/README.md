# catalog — 类目与商品

> 核心域 · schema `catalog` · 骨架已落

```yaml
module: catalog
layer: 核心域
schema: catalog
status: in-progress
depends_on: ["trust :: api", "audit"]
emits: ["SellerOfferSubmitted", "OfferPublished", "OfferOffline"]
consumes: ["MerchantApproved", "SellerSuspended", "CategoryGrantRevoked", "CredentialExpired"]
```

## 职责

类目树、属性模板、SPU/SKU、品牌、发布状态。

## 拥有什么

`category` `attribute` `spu` `sku` `offer`

表都建在 `catalog` schema 里，跨 schema 不 JOIN、不建外键。

完整十三张表、状态机、六条不变式见
[product-model.md](../../../../../../../../../docs/domain/product-model.md)。当前落 9 张（category / attribute / brand / spu / spu_attr / spu_media / sku / offer / offer_review），前台类目和类目迁移等第二刀。

## 边界

**发布权只有 catalog 给。** 商家只能提草稿，平台给上架。

## 闭环断点

发布链路已落（建 SPU/SKU → 提交 offer → auto_approve 类目自动上架 → 买家详情）。
对外只读入口 `CatalogQuery.findSellable` 已落，算价与下单靠它拿价格、重量、店铺归属。

未做：人工审核 controller（等 staff 身份）、前台类目、类目迁移、搜索消费。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
