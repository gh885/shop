# catalog — 类目与商品

> 核心域 · schema `catalog` · 类目配置与发布链路已落

```yaml
module: catalog
layer: 核心域
schema: catalog
status: in-progress
depends_on: ["governance :: api", "audit :: api"]
emits: ["SellerListingSubmitted", "ListingPublished", "ListingOffline"]
consumes: ["MerchantApproved", "SellerSuspended", "CategoryGrantRevoked", "CredentialExpired"]
```

## 职责

类目树、类目配置、属性模板、SPU/SKU、品牌、发布状态。

## 模块契约

### 输入

| 来源                | 拿什么                                                                                | 用在哪               | 拿不到会怎样                        |
| ------------------- | ------------------------------------------------------------------------------------- | -------------------- | ----------------------------------- |
| `governance :: api` | `canSell(merchantId, categoryId, brandId, qualificationCodes)` → `SellDecision`       | 发布 / 上架前判资格  | 拒绝时带稳定 reasonCode，直接挡发布 |
| `audit`             | `AuditRecorder.record(...)`                                                           | 写操作留痕           | 见下方边界缺口                      |
| 事件                | `MerchantApproved` / `SellerSuspended` / `CategoryGrantRevoked` / `CredentialExpired` | 商家状态变了收敛挂售 | 挂了就继续卖不该卖的东西            |

### 输出

| 消费方           | 给什么                                | 什么时候    |
| ---------------- | ------------------------------------- | ----------- |
| `pricing :: api` | `findSellable(skuId)` → `SellableSku` | 算价第 1 层 |

事件：`SellerListingSubmitted` / `ListingPublished` / `ListingOffline`。

### 边界

- **不判"能不能卖"**：`governance` 判，这里只把 `qualification_codes` 传过去——反过来让 governance 读 catalog 就成环
- **不管库存、不管优惠**：库存归 `inventory`，价格规则归 `promotion`
- **边界缺口**：`catalog` import 的是 `audit.service.AuditRecorder` / `audit.model.AuditEntry`，不是 `audit :: api`——
  audit 没有 api 包。这是既成事实，不是设计

## 拥有什么

`category` `category_config` `attribute` `brand` `spu` `spu_attr` `spu_media` `sku` `listing` `listing_review`

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

## 编辑链路

卖家改自己的商品走 `SellerProductEditService`，与发布链路分成两个类：

| 动作                 | 端点                                        | 改已上架的商品会怎样               |
| -------------------- | ------------------------------------------- | ---------------------------------- |
| 读详情（任何状态）   | `GET /api/seller/products/{spuId}`          | —                                  |
| 改基本信息           | `PUT /api/seller/products/{spuId}`          | **退回审核**（免审类目立即重上架） |
| 改 SKU（价/重/停售） | `PUT /api/seller/products/{spuId}/skus`     | 同上                               |
| 商家主动下架         | `POST /api/seller/products/{spuId}/offline` | 只有 online 能下                   |
| 重新提交             | `POST /api/seller/products/{spuId}/relist`  | 回 pending，**不直接回 online**    |
| 删草稿               | `DELETE /api/seller/products/{spuId}`       | 只有从没提交过挂售的能删           |

三条硬规矩：

- **改已上架商品必须退回审核。** 判据不是「改了什么字段」，而是「这个商品现在是不是正在卖」。
  不加它，「先上架合规商品、再改成违规商品」就是一条绕过审核的路，而平台侧完全看不见
  （状态一直显示 online）。审核中（pending）直接拒改：审核员看的那一版和商家提交的那一版必须一致。
- **改 SKU 是全量替换：请求里没给的 SKU 一律停售。** 增量语义下商家删掉的规格会永远活着，
  继续出现在可售点查里，买家能买到商家以为已经删掉的规格。停售不删行——
  `trade.order_line.sku_id` 还指着它，删了历史订单的规格身份就断了。
- **类目和规格都不能改。** 换类目等于换一套属性模板与值域，旧 `spu_attr` 行全部对不上；
  换规格等于把 SKU 变成另一个商品，而历史订单里那条 sku_id 还指着它。

编辑链路复用发布链路的四个闸门（`requireCategory` / `requireConfig` / `checkBrandPolicy` /
`checkRequiredAttributes` / `checkGovernance`），不复制——两处判断迟早会漂。

## 闭环断点

发布链路已落：建类目配置（staff）→ 建 SPU/SKU（卖家）→ 提交 listing → `auto_approve` 类目自动上架 → 买家详情。
编辑链路已落：卖家详情 / 改基本信息 / 改 SKU / 下架 / 重提 / 删草稿。
对外只读入口 `CatalogQuery.findSellable` 已落，算价与下单靠它拿价格、重量、店铺归属。

**识别键已落库**：`IdentityKeyResolver` 统一算 `spu.match_key` 和 `sku.identity_key`。
品牌标品走 `品牌:型号`，白牌标品走参数哈希（数字归一、单位进键、传参顺序无关），
`sku.identity_key` 和 `barcode` 不再是 NULL——比价和售后认规格有数据可用了。

**标准品匹配已落**：`StandardMatcher` 在 SPU 落库后挂 `standard_spu_id` / `standard_matched_by`。
标准品懒建（第一个发布到这个识别键的商家顺手建出来，没有独立创建入口），
`match_strategies` 决定识别键的试用顺序（配了按它，没配按 `identity_keys` 声明顺序）。

未做：前台类目、类目迁移、搜索消费、卖家商品列表（分页/筛选/排序）。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
