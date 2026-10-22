# catalog — 类目与商品

> 核心域 · schema `catalog` · 类目配置与发布链路已落

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

类目树、类目配置、属性模板、SPU/SKU、品牌、发布状态。

## 拥有什么

`category` `category_config` `attribute` `brand` `spu` `spu_attr` `spu_media` `sku` `offer` `offer_review`

表都建在 `catalog` schema 里，跨 schema 不 JOIN、不建外键。

完整十四张表、状态机、六条不变式见
[product-model.md](../../../../../../../../../docs/domain/product-model.md)。当前落 10 张，前台类目和类目迁移等第二刀。

## 树与配置分开

**`category` 只描述"在哪"，`category_config` 只描述"要求什么"，且只对第 3 层存在。**

三层定死（`level BETWEEN 1 AND 3`），只有叶子能挂商品、能有配置。前两层是纯分组：只收 code / name / sort，不收任何配置。

这条分工的意义：`identity_keys` 这类字段只对能挂商品的类目有意义。平铺在每一行上时，L1/L2 那些值永远是 NULL、永远不被读，而"L1 配了会怎样"会变成一个需要写解析器回答的问题。拆开之后它不存在了——L1 没有配置行可写。

**「只有叶子能有配置」由触发器保证**（`catalog.require_leaf_config` / `catalog.require_leaf_attribute`），绕过 API 直接写 SQL 也插不进去。

**不做属性模板继承。** 配一个叶子 = 一次给齐属性模板 + 识别键 + 品牌策略 + 资质 + 审核策略。省事靠"从同类目复制"，不靠运行时沿链合并——复制是显式可 diff 的，继承要写三个合并函数且每个都可能写错。

**不存 `is_leaf`。** 三层定死之后它就是 `level = 3`。存一份就多一个会漂移的真相源——而原来那份确实漂了：插子类目时没人把父类目改成 `false`，发布闸门靠它拦「往非叶子挂商品」从来没真正生效过。

## 边界

**发布权只有 catalog 给。** 商家只能提草稿，平台给上架。

## 闭环断点

发布链路已落：建类目配置（staff）→ 建 SPU/SKU（卖家）→ 提交 offer → `auto_approve` 类目自动上架 → 买家详情。
对外只读入口 `CatalogQuery.findSellable` 已落，算价与下单靠它拿价格、重量、店铺归属。

**识别键已落库**：`IdentityKeyResolver` 统一算 `spu.match_key` 和 `sku.identity_key`。
品牌标品走 `品牌:型号`，白牌标品走参数哈希（数字归一、单位进键、传参顺序无关），
`sku.identity_key` 和 `barcode` 不再是 NULL——比价和售后认规格有数据可用了。

未做：标准品匹配（`standard_spu_id` 挂载）、人工审核 controller、下架事件、前台类目、类目迁移、搜索消费。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
