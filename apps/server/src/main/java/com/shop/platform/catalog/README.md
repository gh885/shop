# catalog — 类目与商品

> 核心域 · schema `catalog` · 类目配置与发布链路已落

```yaml
module: catalog
layer: 核心域
schema: catalog
status: in-progress
depends_on: ["governance :: api", "audit :: api", "inventory :: api"]
emits: ["ListingPublished", "ListingOffline"]
consumes: ["SellerSuspended"]
```

## 职责

类目树、类目配置、属性模板、SPU/SKU、品牌、发布状态。

## 模块契约

### 输入

| 来源                | 拿什么                                                                                | 用在哪               | 拿不到会怎样                        |
| ------------------- | ------------------------------------------------------------------------------------- | -------------------- | ----------------------------------- |
| `governance :: api` | `canSell(merchantId, categoryId, brandId, qualificationCodes)` → `SellDecision`       | 发布 / 上架前判资格  | 拒绝时带稳定 reasonCode，直接挡发布 |
| `audit`             | `AuditRecorder.record(...)`                                                           | 写操作留痕           | 见下方边界缺口                      |
| 事件                | `SellerSuspended` | 商家停业后级联下架在线 listing | 停业商家会继续卖不该卖的东西 |

### 输出

| 消费方           | 给什么                                | 什么时候    |
| ---------------- | ------------------------------------- | ----------- |
| `pricing :: api` | `findSellable(skuId)` → `SellableSku` | 算价第 1 层 |

事件：`ListingPublished` / `ListingOffline`。

### 边界

- **不判"能不能卖"**：`governance` 判，这里只把 `qualification_codes` 传过去——反过来让 governance 读 catalog 就成环
- **不管库存、不管优惠**：库存归 `inventory`，价格规则归 `promotion`
- **边界缺口**：`catalog` import 的是 `audit.service.AuditRecorder` / `audit.model.AuditEntry`，不是 `audit :: api`——
  audit 没有 api 包。这是既成事实，不是设计

## 拥有什么

`category` `category_config` `attribute` `attribute_value` `brand` `spu` `spu_attr` `spu_media` `sku` `listing` `listing_review`

表都建在 `catalog` schema 里，跨 schema 不 JOIN、不建外键。

完整十四张表、状态机、六条不变式见
[product-model.md](../../../../../../../../../docs/domain/product-model.md)。当前落 11 张，前台类目和类目迁移等第二刀。

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

| 动作                 | 端点                                        | 改已上架的商品会怎样                           |
| -------------------- | ------------------------------------------- | ---------------------------------------------- |
| 读详情（任何状态）   | `GET /api/seller/products/{spuId}`          | —                                              |
| 改基本信息           | `PUT /api/seller/products/{spuId}`          | **offline → pending 重新审核**（免审直接 online） |
| 改 SKU（价/重/停售） | `PUT /api/seller/products/{spuId}/skus`     | 同上                                           |
| 新增 SKU（加规格组合） | `POST /api/seller/products/{spuId}/skus`  | 同上                                           |
| 商家主动下架         | `POST /api/seller/products/{spuId}/offline` | 只有 online 能下                               |
| 重新提交             | `POST /api/seller/products/{spuId}/relist`  | 回 pending，**不直接回 online**                |
| 删草稿               | `DELETE /api/seller/products/{spuId}`       | 只有从没提交过挂售的能删                       |

五条硬规矩：

- **改已上架商品必须退回审核，而且是一条链路走完：`offline → pending`（免审类目直接回 `online`）。**
  只下架、等商家手动重提会让商品静默下线，商家还以为在卖。审核中（pending）直接拒改：
  审核员看的那一版和商家提交的那一版必须一致。
- **改 SKU 是全量替换：请求里没给的 SKU 一律停售。** 增量语义下商家删掉的规格会永远活着，
  继续出现在可售点查里。停售只改 `status`，**不碰价格和重量**——顺手写 0 会让这条规格
  下次带回来时变成 ¥0 在售。
- **SKU 可以新增，规格不能改。** 要换规格就停售旧的、用 `POST /skus` 加新的；新 SKU 的规格维度
  必须和现有 SKU 一致。`status = null` 表示保持当前状态，不是「重新上架」。
- **类目不能改。** 换类目等于换一套属性模板与值域，旧 `spu_attr` 行全部对不上。
- **一个 active SKU 都不留会被拒。** 全部停售等于商品不可售，应该在「下架」入口表达，不该混在改价里。

编辑链路复用发布链路的闸门（`requireCategory` / `requireMountableCategory` / `requireConfig` /
`checkBrandPolicy` / `checkRequiredAttributes` / `checkSpecAttributes` / `checkBarcodes` /
`checkGovernance`），不复制——两处判断迟早会漂。**提交 / 重提会重跑全部闸门**：草稿可能是
类目配置变更之前建的，只在创建时校验等于放行旧数据。

**多店挂售按 SPU 处理，不按单条 listing。** 一个 SPU 可以挂多家店；标题、属性、图都是 SPU 级的，
改一次会影响所有店。编辑触发重审时：任一 listing 在审核中 → 拒改；所有 online listing 先逐条下架，
再逐店重提。卖家列表/状态计数用 `LEFT JOIN LATERAL` 取一条「最需要关注」的 listing 展示
（pending > rejected > online > offline > approved > draft），一个 SPU 只出现一次。

**内容闸门**：标题/副标题在提交、重新上架、以及任何已有 listing 的编辑时过违禁词检查；
草稿放行（商家得先把内容写进去）。命中返回 `FORBIDDEN_WORD_HIT`，`errors[].field` 用
`name`（标题，兼容旧前端 parser）和 `subtitle`。

**商品字段**：副标题、详情图（`spu_media.media_type = 'detail'`）、七天无理由、销量、划线价、
商家 SKU 编码（同商家唯一）、规格图（`spu_media.attribute_id + spec_value`）。
单规格商品允许 `specs = {}`，类目也可以没有 `is_sales_spec` 属性。

## 类目配置运营

| 动作                 | 端点                                                          | 权限              |
| -------------------- | ------------------------------------------------------------- | ----------------- |
| 读配置               | `GET /api/admin/categories/{categoryId}/config`               | `CATEGORY_MANAGE` |
| 建类目               | `POST /api/admin/categories`                                  | `CATEGORY_MANAGE` |
| 改配置               | `PUT /api/admin/categories/{categoryId}/config`               | `CATEGORY_MANAGE` |
| 加属性               | `POST /api/admin/categories/{categoryId}/attributes`          | `CATEGORY_MANAGE` |
| 改属性               | `PUT /api/admin/categories/{categoryId}/attributes/{attributeId}` | `CATEGORY_MANAGE` |
| 加属性值             | `POST /api/admin/categories/{categoryId}/attributes/{attributeId}/values` | `CATEGORY_MANAGE` |
| 改属性值（图/排序/启停） | `PUT /api/admin/categories/{categoryId}/attributes/{attributeId}/values/{valueId}` | `CATEGORY_MANAGE` |
| 品牌列表/新建/审核   | `/api/admin/brands`                                           | `CATEGORY_MANAGE` |
| 卖家选品牌（只读 approved） | `GET /api/seller/brands?keyword=`                        | `PRODUCT_READ`    |

**有商品之后锁死的字段**：识别键、匹配策略、SKU 识别键（改它们让存量 `match_key` /
`sku.identity_key` 全部失效）、识别 / 规格 / 必填属性的增删和上下线、必填与多选的变更。
改名、筛选、排序、`brand_policy`、资质、免审随时可改。

属性只增不删，下线走 `status = disabled`；类型 / 单位 / 值域 / 识别 / 规格标记从创建起不可改。
`is_multi` 属性可以填多个值：请求里同一个 `attributeId` 出现多次即可。`is_sales_spec` 属性
不能是多值——规格维度必须单值才能拼 `spec_key`。

**条件可见**存在 `attribute.visible_when`：`{"attributeId","operator","values"}`，
`operator` 只收 `eq / neq / in`。只允许单层依赖——被依赖属性自己不能再带规则，
销售规格属性也不能当依赖源，从根上避免成环。规则只存不在这里求值，由前端按当前填写值展开。

**类目状态真正生效**：`frozen` 只拦新挂入（建草稿、新 listing），存量编辑和售卖照常；
`closed` 从可售点查、买家列表、详情、比价里全部消失，算价与下单拿不到它。

**商家停业级联**：governance 的 `SellerSuspended` 事件由 `MerchantSuspensionListener` 消费，
把该商家所有 online listing 逐条走 `offlineOffer` 下架（状态迁移、审计、`ListingOffline` 与
卖家手动下架同一条链路）。事件是 outbox 异步投递；停业本身已经先让 `governance.canSell`
拒绝新的提交/上架。

## 闭环断点

发布链路已落：建类目配置（staff）→ 建 SPU/SKU（卖家）→ 提交 listing → `auto_approve` 类目自动上架 → 买家详情。
编辑链路已落：卖家详情 / 改基本信息 / 改 SKU / 新增 SKU / 下架 / 重提 / 删草稿。
对外只读入口 `CatalogQuery.findSellable` 已落，算价与下单靠它拿价格、重量、店铺归属。

**识别键已落库**：`IdentityKeyResolver` 统一算 `spu.match_key` 和 `sku.identity_key`。
品牌标品走 `品牌:型号`，白牌标品走参数哈希（数字归一、单位进键、传参顺序无关），
`sku.identity_key` 和 `barcode` 不再是 NULL——比价和售后认规格有数据可用了。
**参数哈希要求所有识别属性齐全**：缺一项就不生成键，避免用「短哈希」把不同商品误并成同款。

**标准品匹配已落**：`StandardMatcher` 在 SPU 落库后挂 `standard_spu_id` / `standard_matched_by`。
标准品懒建（第一个发布到这个识别键的商家顺手建出来，没有独立创建入口），
`match_strategies` 决定识别键的试用顺序（配了按它，没配按 `identity_keys` 声明顺序）。
**识别键按类目分区**：`uq_spu_standard_match (category_id, identity_kind, match_key)`——
`param_hash` 不含类目，跨类目撞键不能共用一个标准品。

## 标准品运营与消费

标准品就是 `catalog.spu` 里 `spu_type = 'standard'` 的行，没有独立表（product-model §2.3）。
合并态靠 `merged_into IS NOT NULL` 表达，**没有 status 列**——加一个就是
`merged_into IS NOT NULL` 的同义词，只多一处会漂的地方。

| 动作                     | 端点                                                           | 权限             |
| ------------------------ | -------------------------------------------------------------- | ---------------- |
| **卖家商品列表**         | `GET /api/seller/products?status=&keyword=&cursor=&limit=`     | `PRODUCT_READ`   |
| 运营列表（默认含已合并） | `GET /api/admin/standard-products`                             | `PRODUCT_REVIEW` |
| 合并（源并入目标）       | `POST /api/admin/standard-products/{sourceId}/merge?targetId=` | `PRODUCT_REVIEW` |
| 卖家挂靠候选             | `GET /api/seller/standard-products`                            | `PRODUCT_WRITE`  |
| 卖家挂靠 / 取消挂靠      | `PUT /api/seller/standard-products/products/{spuId}`           | `PRODUCT_WRITE`  |
| 本店挂了多少             | `GET /api/seller/standard-products/{id}/bound-count`           | `PRODUCT_WRITE`  |
| **买家同款比价**         | `GET /api/buyer/catalog/standard-products/{id}/offers`         | 限流 300/min     |

**合并做三件事，同一个事务**：挂源的商品全部改指目标（一条 UPDATE，不逐行读改写）→
源记下 `merged_into`（条件更新，0 行 = 已被别人并走，回 409）→ 不物理删源。
顺序不能反：先标记再改指，中间那一瞬会有商品指向一条已标记合并的行。

**两个都必须是「还没被合并」的标准品。** 允许并到一个已合并的目标上会造出 A→B→C 的链，
而每个读 `standard_spu_id` 的地方都得解链。现在解链只在 `StandardProductService` 一处
（递归 CTE，深度上限 20 兜 A→B→A 这种两行互指）。

**合并是必要的而不是洁癖**：自动匹配只做精确匹配，而同一个东西有多种写法
（`A3294` 和 `A-3294` 是两个键），没有合并它们永远各自为政——而那正是标准品要解决的问题。

**同款比价按 `sku.identity_key` 分组，不按 SPU**（product-model 不变式 6）：
拿 SPU 最低价比价，等于拿 128G 的价和 256G 的价比。所以返回两个形状——
`offers`（同款有哪些在卖，聚合视角）和 `pricesBySpec`（同一个规格各家卖多少，
买家做决策用的那一半）。

**`standard_spu_id` 此前只写不读。** 自动匹配一直在往库里写，但没有任何消费者，
标准品对系统行为零影响。同款比价是它的第一个真实读方。

## 卖家商品列表

`GET /api/seller/products`——**任何状态都列**：草稿、审核中、被驳回、已下架、已上架。
买家侧只认 online，而商家最需要看的恰恰是「我那个被驳回的」和「还没提交的」。

在它之前商家没有任何办法列出自己的商品：所有商品端点的路径参数都是 `spuId`，而他拿不到那些 id。
**卖家订单列表当初缺的是同一个东西**——接口都在，入口没有。

四条决定：

- **游标分页，不是 offset。** 商家发新商品时 `OFFSET 20` 会重新返回上一页的最后几条。
  全项目列表都是游标（`CursorCodec`），这里不例外
- **不按店铺过滤，按商家过滤。** 一个 SPU 可能挂在多个店铺（`listing` 一对多），
  按店铺筛会让同一个商品在不同店铺下重复出现
- **列表不带 SKU 明细**，只带聚合（SKU 数、起价、库存合计）。一页 20 条 × 平均 5 个 SKU
  就是 100 行，而卡片只显示「¥99 起 · 12 件」
- **库存经 `inventory :: api` 批查，不跨 schema 读。** 三步：列表 → 本页 SKU → 批量库存。
  代价是一个往返，收益是「可售量」的定义只住在 `InventoryQuery` 一处

**两个库存口径不要合并**：`availableToPromise(skuId)` 只看默认仓（「现在能不能卖」，
下单路径只从默认仓发货）；`availableBySkuIds(skuIds)` 跨仓求和（「我还有多少货」）。

状态词表就是 `listing.status` 加上「没有 listing」这一档（映射成 `draft`），
它是 SQL 里 `COALESCE(l.status, 'draft')` 的镜像。未知值 400，不放进去变成永远空页。

响应带各状态计数（`counts.all` + `counts.byStatus`），筛选标签不必再发四个请求；
两者同一快照，所以「全部」恒等于各标签之和。

未做：前台类目、类目迁移、搜索消费、**列表排序**（按库存/销量排要全量聚合后内存排序，
而库存经 api 拿——这个取舍留到真有人要的时候）、标准品人工新建/改标题
（合并够用——运营真正需要的是「把两个已有的合成一个」，不是凭空造一个没有商品挂的标签）。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
