# catalog — 类目与商品

> 核心域 · schema `catalog` · 未开工

```yaml
module: catalog
layer: 核心域
schema: catalog
status: not-started
depends_on: ["trust :: api"]
emits: ["SellerOfferSubmitted", "OfferPublished", "OfferOffline"]
consumes: []
```

## 职责

类目树、属性模板、SPU/SKU、品牌、发布状态。

## 拥有什么

`category` `attribute` `spu` `sku` `listing`

表都建在 `catalog` schema 里，跨 schema 不 JOIN、不建外键。

完整八张表、状态机、五个不变式见
[product-model.md](../../../../../../../../../docs/domain/product-model.md)。

## 边界

**发布权只有 catalog 给。** 商家只能提草稿，平台给上架。

## 闭环断点

未开工。类目树、属性模板、SKU、上下架都还没有——它是第一个纵切的首选。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
