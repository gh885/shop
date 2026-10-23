# catalog/mapper — 表结构与字段字典

> 这个目录只放 SQL。状态机、业务规则在 `model/` 和 `service/`，表为什么这么设计在
> [product-model.md](../../../../../../../../../../docs/domain/product-model.md)。

schema `catalog` 共 10 张表。字段以**迁移文件叠加后的最终形态**为准（含
`V20261022111000` 的增列与删列、`V20261022112500` 的三层定死、`V20261022113500` 的配置拆表）。

几条全局约定，读下面任何一张表都要先记住：

- 不建外键。`spu.category_id`、`offer.spu_id` 这些指向关系由代码保证，跨 schema 更不 JOIN。
- 时间列一律 `timestamptz`。除 `offer_review` 外的表都有 `updated_at`，由
  `common.touch_updated_at()` 触发器维护——**UPDATE 语句里永远不要自己写 `updated_at = now()`**。
- 状态列存**枚举名的小写**（`'active'`、`'pending'`）。`RowMappers` 靠这条约定把字符串反解成枚举，
  不守约定的枚举会在映射时抛异常，不会静默错值。
- 金额拆两列：`price_amount bigint`（**分**）+ `price_currency char(3)`。没有浮点，没有裸 int64。
- 列名带 `is_` 前缀的（`is_sales_spec` / `is_required` / …），record 字段名不带。SQL 里必须
  `AS sales_spec` 对齐，否则 `DataClassRowMapper` 报「ResultSet 中找不到栏位名称」。

## 表一览

| 表                | 一句话                           | 谁在写                |
| ----------------- | -------------------------------- | --------------------- |
| `category`        | 类目树，只描述"在哪"             | `CategoryStore`       |
| `category_config` | 叶子类目的配置，只描述"要求什么" | `CategoryConfigStore` |
| `attribute`       | 叶子类目的属性模板               | `CategoryConfigStore` |
| `brand`           | 品牌                             | 目前无写入代码        |
| `spu`             | 商品主数据（商家级，不带店铺）   | `ProductStore`        |
| `spu_attr`        | SPU 的属性值                     | `ProductStore`        |
| `spu_media`       | 商品图，可挂规格值               | `ProductStore`        |
| `sku`             | 规格 + 价格 + 重量               | `ProductStore`        |
| `offer`           | 某商家在某店铺挂售某 SPU         | `OfferStore`          |
| `offer_review`    | offer 每轮审核记录               | `OfferStore`          |

---

## catalog.category

**只描述"在哪"，没有任何配置。** 配置在 `category_config`。

类目树用**路径枚举**存层级：`path` 含自己，查子树是 `LIKE '/xxx/%'` 走索引，查祖先在应用层 split
字符串，一次库都不用查。**深度定死 3 层**，第 3 层是叶子。

| 字段         | 类型        | 空 / 默认                | 说明                                                                                                     |
| ------------ | ----------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `id`         | uuid        | PK，默认 `uuidv7()`      | 类目 id                                                                                                  |
| `parent_id`  | uuid        | 可空，根为 null          | 父类目。不建外键                                                                                         |
| `path`       | text        | NOT NULL，唯一           | 从根到自己的路径，形如 `/a1b2/`，**包含自己**。改父节点要批量改子树前缀                                  |
| `level`      | smallint    | NOT NULL                 | 层级 1..3，必须等于 `path` 的段数（`ck_category_path_shape` 兜着）。**3 = 叶子，`is_leaf` 不存列**       |
| `code`       | text        | NOT NULL，唯一           | 对外稳定标识，**不可变**。改它等于对外换了一个类目                                                       |
| `name`       | text        | NOT NULL                 | 展示名                                                                                                   |
| `status`     | text        | NOT NULL，默认 `'draft'` | `draft`（配置没配齐，挂不了商品）/ `active` / `frozen`（禁新挂入，存量卖完为止）/ `closed`（连下单都拦） |
| `sort`       | integer     | NOT NULL，默认 `0`       | 同级类目的展示顺序，升序                                                                                 |
| `created_at` | timestamptz | NOT NULL，默认 `now()`   | 创建时间                                                                                                 |
| `updated_at` | timestamptz | NOT NULL，默认 `now()`   | 由 `trg_category_touch` 维护                                                                             |

约束：`uq_category_path`、`uq_category_code`、`ck_category_level (1..3)`、`ck_category_status`、
`ck_category_path_shape`（path 首尾带 `/`、含自己 id、段数 = level）。

索引：`idx_category_path_prefix (path text_pattern_ops)` 服务子树查询；
`idx_category_parent_sort (parent_id, sort)` 服务"按父节点取子节点并按序"（单列 `parent_id` 那条已删，是它的前缀）。

**`is_leaf` 已删**（`V20261022112500`）。三层定死之后它就是 `level = 3`，存一份就多一个会漂移的真相源——
而原来那份确实漂了：插子类目时没人把父类目改成 `false`，发布闸门靠它拦「往非叶子挂商品」从来没生效过。

## catalog.category_config

**只对第 3 层存在，一行一个类目。没有继承、没有沿链合并。**

| 字段                  | 类型        | 空 / 默认                   | 说明                                                                                                                                |
| --------------------- | ----------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `category_id`         | uuid        | PK                          | 指向 `category`。**触发器强制 level = 3**                                                                                           |
| `identity_keys`       | text[]      | NOT NULL                    | SPU 级识别键**候选**：`model_no` / `article_no` / `param_hash` / `none`。**GTIN 不许进这一列**                                      |
| `sku_identity_kinds`  | text[]      | NOT NULL                    | SKU 级识别键候选：`gtin` / `param_hash` / `none`。GTIN 只在这里                                                                     |
| `match_strategies`    | text[]      | NOT NULL，默认 `'{}'`       | 标准品归并的**试用顺序**：`model_no` / `article_no` / `param_hash`。`IdentityKeyResolver` 按它往下试，空则退回 `identity_keys` 顺序 |
| `brand_policy`        | text        | NOT NULL，默认 `'optional'` | `required`（必须选品牌）/ `optional` / `forbidden`（不许选）                                                                        |
| `qualification_codes` | text[]      | NOT NULL，默认 `'{}'`       | 该类目要求的资质编码列表，实际校验归 `trust`                                                                                        |
| `auto_approve`        | boolean     | NOT NULL，默认 `false`      | 该叶子类目下提交 offer 是否免审直接上架                                                                                             |
| `created_at`          | timestamptz | NOT NULL，默认 `now()`      | 创建时间                                                                                                                            |
| `updated_at`          | timestamptz | NOT NULL，默认 `now()`      | 由 `trg_category_config_touch` 维护                                                                                                 |

约束：`ck_config_identity_keys`、`ck_config_sku_identity_kinds`、`ck_config_match_strategies`、
`ck_config_brand_policy`。

**护栏：`catalog.require_leaf_config()` 触发器。** INSERT / UPDATE 时读 `category.level`，不等于 3 直接抛错。
这是结构约束不是纪律——绕过 API 直接写 SQL 也插不进去。

**为什么拆表而不是在原表上改可空 + 沿链解析**：补丁式继承的代价是错误模型永远留在表里，
每次读都要绕过它。拆开之后读一个叶子的配置就是一条 `WHERE category_id = ?`，
而"L1 配了会怎样"这个问题消失了——L1 没有配置行。

**为什么识别键是数组不是枚举**：同一个类目里品牌货和白牌货并存，前者 SPU 认型号、SKU 认 GTIN，
后者两头都认参数哈希。一列枚举表达不了，只能给候选列表。

## catalog.attribute

**叶子类目的**属性模板，同样由 `catalog.require_leaf_attribute()` 触发器强制只挂 level = 3。
属性**只增不删**，下线走 `status`——删了存量 `spu_attr` 就没有定义。

| 字段            | 类型        | 空 / 默认                 | 说明                                                                                    |
| --------------- | ----------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `id`            | uuid        | PK，默认 `uuidv7()`       | 属性 id                                                                                 |
| `category_id`   | uuid        | NOT NULL                  | 属于哪个类目。属性是类目级的，不跨类目复用                                              |
| `code`          | text        | NOT NULL                  | 属性编码，类目内唯一（`uq_attribute_code`）。`spu_attr` 的展示、筛选、参数哈希都靠它    |
| `name`          | text        | NOT NULL                  | 展示名                                                                                  |
| `value_type`    | text        | NOT NULL                  | `text` / `number` / `enum` / `bool`。决定 `spu_attr` 里哪个值列有值                     |
| `options`       | jsonb       | 可空                      | `enum` 的值域。`ck_attribute_enum_options` 强制 enum 必须有它——没值域的枚举就是自由文本 |
| `is_sales_spec` | boolean     | NOT NULL，默认 `false`    | 是否销售规格（颜色/尺码）。true 的会进 `sku.spec_values`                                |
| `is_required`   | boolean     | NOT NULL，默认 `false`    | 发布时是否必填                                                                          |
| `is_identity`   | boolean     | NOT NULL，默认 `false`    | 是否参与参数哈希。**白牌标品的命门**，少标一个同款就归并错                              |
| `is_filterable` | boolean     | NOT NULL，默认 `false`    | 是否进筛选面板（走 `idx_spu_attr_num` / `idx_spu_attr_bool`）                           |
| `is_multi`      | boolean     | NOT NULL，默认 `false`    | 是否多值。多值时 `spu_attr.value_index` 才有意义                                        |
| `unit`          | text        | 可空                      | 数字型属性的单位（`m` / `cm` / `W`）。没有它 1m 和 100cm 是两个值                       |
| `status`        | text        | NOT NULL，默认 `'active'` | `active` / `disabled`。disabled 后不再对新商品可见，存量属性值保留                      |
| `sort`          | integer     | NOT NULL，默认 `0`        | 表单里的展示顺序                                                                        |
| `created_at`    | timestamptz | NOT NULL，默认 `now()`    | 创建时间                                                                                |
| `updated_at`    | timestamptz | NOT NULL，默认 `now()`    | 由 `trg_attribute_touch` 维护                                                           |

约束：`ck_attribute_value_type`、`ck_attribute_status`、`ck_attribute_identity_type`
（`is_identity` 只允许 `enum` / `number`——自由文本进哈希等于归并失效）、
`ck_attribute_enum_options`、`ck_attribute_unit`（单位只对 `number` 有意义）。

索引：`idx_attribute_category_sort (category_id, sort)`（旧的单列 `idx_attribute_category` 已删，是它的前缀）。

## catalog.brand

只存品牌本身。**谁能在这个类目卖这个品牌归 `trust`**，不在这张表。

| 字段         | 类型        | 空 / 默认                   | 说明                                                                                           |
| ------------ | ----------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| `id`         | uuid        | PK，默认 `uuidv7()`         | 品牌 id                                                                                        |
| `name`       | text        | NOT NULL                    | 品牌名。`uq_brand_name` 建在 `lower(name)` 上——两个"Apple"并存，商家在必填品牌的类目里就会选错 |
| `owner_type` | text        | NOT NULL，默认 `'platform'` | `platform`（平台建）/ `merchant`（商家申请）                                                   |
| `status`     | text        | NOT NULL，默认 `'pending'`  | `pending` / `approved` / `rejected`。商家品牌要审                                              |
| `owner_id`   | uuid        | 可空                        | `owner_type = 'merchant'` 时的归属商家；platform 品牌为 null（`ck_brand_owner` 强制）          |
| `logo_url`   | text        | 可空                        | 品牌 logo                                                                                      |
| `created_at` | timestamptz | NOT NULL，默认 `now()`      | 创建时间                                                                                       |
| `updated_at` | timestamptz | NOT NULL，默认 `now()`      | 由 `trg_brand_touch` 维护                                                                      |

索引：`uq_brand_name (lower(name))` 唯一。

## catalog.spu

商品主数据。**商家级，没有 `shop_id`**——同一个 SPU 可以在同一商家的两家店各挂一条 `offer`，
那不叫两个商品。店铺归属在 `offer` 上。

| 字段                  | 类型        | 空 / 默认                   | 说明                                                                                                               |
| --------------------- | ----------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`                  | uuid        | PK，默认 `uuidv7()`         | SPU id                                                                                                             |
| `spu_type`            | text        | NOT NULL，默认 `'merchant'` | `merchant`（商家建）/ `standard`（平台标准品）                                                                     |
| `merchant_id`         | uuid        | 可空                        | 归属商家；`standard` 行为 null。也是分片键                                                                         |
| `category_id`         | uuid        | NOT NULL                    | 挂载类目，必须是叶子                                                                                               |
| `brand_id`            | uuid        | 可空                        | 白牌为 null                                                                                                        |
| `model_no`            | text        | 可空                        | 型号 / 款号，人看的。当前 `ProductStore` 用它同时填 `match_key`                                                    |
| `identity_kind`       | text        | NOT NULL，默认 `'none'`     | `model_no` / `article_no` / `param_hash` / `none`。**没有 `gtin`**——GTIN 是 SKU 粒度的                             |
| `match_key`           | text        | 可空                        | 识别键的值，形如 `APPLE:A3294` 或参数哈希。`ck_spu_match_key` 强制"`identity_kind = 'none'` ⇔ `match_key IS NULL`" |
| `standard_spu_id`     | uuid        | 可空                        | 指向 `spu_type = 'standard'` 的那行；白牌非标永远为 null。由 `StandardMatcher` 挂，不在建 SPU 时写                 |
| `standard_matched_by` | text        | 可空                        | 怎么挂上的：`model_no` / `article_no` / `param_hash` / `manual`。和 `identity_kind` 同源                           |
| `title`               | text        | NOT NULL                    | 商品标题                                                                                                           |
| `created_at`          | timestamptz | NOT NULL，默认 `now()`      | 创建时间                                                                                                           |
| `updated_at`          | timestamptz | NOT NULL，默认 `now()`      | 由 `trg_spu_touch` 维护                                                                                            |

> `status` 列**已删**（`V20261022114500`）。它只在发布通过时被写成 `'active'`，
> 全项目没有任何地方读它，下架时也不会改回去——又一个 `is_leaf`：能从别处推导出来的状态，
> 只在一半路径上维护，就一定会漂。可售状态只有一个来源：`offer.status`。

> `images` 列**已删**（`V20261022111000`）。图只有一个真相源：`spu_media`。原来那个 jsonb 数组
> 只能挂 SPU 级通用图，表达不了"选红色就换图"，留着必然和 `spu_media` 对不上。

约束：`ck_spu_type`、`ck_spu_identity`、`ck_spu_matched`、`ck_spu_match_key`。

索引：`idx_spu_merchant (merchant_id)`、`idx_spu_category (category_id)`、
`idx_spu_standard (standard_spu_id)`，以及偏唯一索引
`uq_spu_standard_match (identity_kind, match_key) WHERE spu_type = 'standard'`——
**一个识别键只能有一个标准品**。商家 SPU 不能加这条：同一个 GTIN 全平台几百个商家都有，加了就没人能发布。

**标准品懒建**：`ProductStore.findOrCreateStandard` 用 `INSERT ... ON CONFLICT DO NOTHING RETURNING id`，
拿不到 id 再按 `(identity_kind, match_key)` SELECT 一次。**不能写成"先查再插 + catch `DuplicateKeyException`"**——
PostgreSQL 里那个异常会终止整个事务，后面的语句全部报 `current transaction is aborted`；
而 `ON CONFLICT` 走推测插入会等并发那一笔（对方回滚 → 我插进去，对方提交 → 我 DO NOTHING），
所以 RETURNING 拿到 0 行时那条标准品必然已提交，紧接着的 SELECT 一定找得到。

## catalog.spu_attr

SPU 的属性值。三个值列**恰好有一个非空**（`ck_spu_attr_one_value`）——全 NULL 的行是
"声明了属性但没有值"，它会让必填校验永远通过。

| 字段           | 类型     | 空 / 默认                    | 说明                                                       |
| -------------- | -------- | ---------------------------- | ---------------------------------------------------------- |
| `spu_id`       | uuid     | NOT NULL，联合主键           | 属于哪个 SPU                                               |
| `attribute_id` | uuid     | NOT NULL，联合主键           | 哪个属性（定义在 `attribute`）                             |
| `value_index`  | smallint | NOT NULL，默认 `0`，联合主键 | 多值属性的第几个值。单值恒为 0。没有它 `is_multi` 就是空话 |
| `value_text`   | text     | 可空                         | `text` / `enum` 类型的值                                   |
| `value_num`    | numeric  | 可空                         | `number` 类型的值。单位看 `attribute.unit`                 |
| `value_bool`   | boolean  | 可空                         | `bool` 类型的值                                            |

主键：`(spu_id, attribute_id, value_index)`。

索引：`idx_spu_attr_value (attribute_id, value_text)` 服务文本筛选；
`idx_spu_attr_num`、`idx_spu_attr_bool` 是偏索引，只索引非空行，服务数字/布尔筛选。

**三个值列按属性类型分派写**（`ProductStore.insertAttribute` 收 `ValueType`，
`number` → `value_num`、`bool` → `value_bool`、其余 → `value_text`）。
原来这里写死 `value_text`，于是数字和布尔属性的值全被塞进文本列，连带
`attribute.unit`、两条偏索引、参数哈希一起变成摆设。发布闸门 `checkValueShape`
先拦格式，落库时就不会炸类型错。

## catalog.spu_media

商品图。**图挂规格值，不挂 SKU**：一条连衣裙 8 色 × 5 码 = 40 个 SKU，图只有 8 套，
挂 SKU 上就是 40 份重复，改一张要改 5 行。

| 字段           | 类型        | 空 / 默认                | 说明                                                                           |
| -------------- | ----------- | ------------------------ | ------------------------------------------------------------------------------ |
| `id`           | uuid        | PK，默认 `uuidv7()`      | 图 id                                                                          |
| `spu_id`       | uuid        | NOT NULL                 | 属于哪个 SPU                                                                   |
| `attribute_id` | uuid        | 可空                     | null = 通用图；非 null = 挂在某个规格属性上（如"颜色"）                        |
| `spec_value`   | text        | 可空                     | 规格值，如 `红色`。和 `attribute_id` 必须同时有或同时无（`ck_spu_media_spec`） |
| `url`          | text        | NOT NULL                 | 图/视频地址                                                                    |
| `media_type`   | text        | NOT NULL，默认 `'image'` | `image` / `video`                                                              |
| `sort`         | integer     | NOT NULL，默认 `0`       | 同组内的展示顺序                                                               |
| `created_at`   | timestamptz | NOT NULL，默认 `now()`   | 创建时间。**这张表没有 `updated_at`，也没有触发器**——图改了就删旧行插新行      |

索引：`idx_spu_media (spu_id, attribute_id, spec_value)`。前端取图逻辑：选中"红"就取
`attribute_id = 颜色 AND spec_value = 红` 那批，没选就取 `attribute_id IS NULL` 的通用图。

## catalog.sku

规格 + 价格 + 重量。价格只在这里，`offer` 不带价格——同一 SPU 下不同规格价格不同。

| 字段             | 类型        | 空 / 默认                 | 说明                                                                                                                         |
| ---------------- | ----------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `id`             | uuid        | PK，默认 `uuidv7()`       | SKU id                                                                                                                       |
| `spu_id`         | uuid        | NOT NULL                  | 属于哪个 SPU                                                                                                                 |
| `spec_values`    | jsonb       | NOT NULL                  | 规格值，形如 `{"<attributeId>": "红色"}`。当前代码用 `Map<UUID,String>` 序列化                                               |
| `spec_key`       | text        | NOT NULL                  | 规格值按 `attribute_id` 排序后拼的串，**只为加唯一索引**。服务端生成，客户端传参顺序不参与——否则"红/L"和"L/红"会变成两个 SKU |
| `barcode`        | text        | 可空                      | 条码原文（GTIN）。类目 `sku_identity_kinds` 含 `gtin` 时**必填**，否则比价和售后认规格都失效                                 |
| `identity_key`   | text        | 可空                      | 规范化后的规格身份键：GTIN 或规格参数哈希。**比价按它聚合**。不加唯一约束：同一 GTIN 全平台几百个商家都有                    |
| `price_amount`   | bigint      | NOT NULL                  | 价格，单位**分**（`ck_sku_price` 保证 ≥ 0）                                                                                  |
| `price_currency` | char(3)     | NOT NULL，默认 `'CNY'`    | 币种                                                                                                                         |
| `weight_g`       | integer     | 可空                      | 重量，单位**克**。运费计算用（`ck_sku_weight` 保证 > 0）                                                                     |
| `status`         | text        | NOT NULL，默认 `'active'` | `active` / `disabled`。`CatalogQuery.findSellable` 只认 active                                                               |
| `created_at`     | timestamptz | NOT NULL，默认 `now()`    | 创建时间                                                                                                                     |
| `updated_at`     | timestamptz | NOT NULL，默认 `now()`    | 由 `trg_sku_touch` 维护                                                                                                      |

约束：`uq_sku_spec (spu_id, spec_key)`——同一 SPU 下规格组合唯一。**规格组合不存在就是表里没这行**，
不存"禁用组合"表。

索引：`idx_sku_identity (identity_key)`。

**`identity_key` 由 `IdentityKeyResolver` 算，不在 mapper 里拼。** 规则：

- GTIN 优先（类目允许 `gtin` 且商家填了条码）→ 规范化后的条码
- 否则退化为规格参数哈希（类目允许 `param_hash`）→ 规格属性按 code 排序拼 `code=值&code=值`
- 数字值走 `BigDecimal` 归一：`1`、`1.0`、`1.00` 是同一个键；**单位进键**（`1|m` ≠ `1|W`），
  所以「归一化不换算」——`1m` 和 `100cm` 是两个值，换算是业务判断
- 大小写和空白归一：`CABLE-A` 和 `cable-a` 是同一个键
- 传参顺序不影响结果：属性按 code 排序后拼

## catalog.offer

"某商家在某店铺挂售某 SPU"这一件事。名字里的 offer 是**挂售**，不是报价。

| 字段            | 类型        | 空 / 默认                | 说明                                                                                       |
| --------------- | ----------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| `id`            | uuid        | PK，默认 `uuidv7()`      | offer id                                                                                   |
| `spu_id`        | uuid        | NOT NULL                 | 挂的哪个 SPU                                                                               |
| `merchant_id`   | uuid        | NOT NULL                 | 商家。也是分片键，冗余存一份避免 JOIN                                                      |
| `shop_id`       | uuid        | NOT NULL                 | 店铺                                                                                       |
| `status`        | text        | NOT NULL，默认 `'draft'` | `draft` → `pending` → `approved`/`rejected` → `online`/`offline`。合法迁移在 `OfferStatus` |
| `reject_reason` | text        | 可空                     | 驳回理由，只有 rejected 时有值                                                             |
| `submitted_at`  | timestamptz | 可空                     | 提交审核时间，insert 时写 `now()`                                                          |
| `approved_at`   | timestamptz | 可空                     | 审核通过时间，只在迁到 `approved` 时写                                                     |
| `approved_by`   | uuid        | 可空                     | 审核人。**免审自动上架为 null**，不是"系统用户"的假 id                                     |
| `created_at`    | timestamptz | NOT NULL，默认 `now()`   | 创建时间                                                                                   |
| `updated_at`    | timestamptz | NOT NULL，默认 `now()`   | 由 `trg_offer_touch` 维护                                                                  |

约束：`uq_offer_spu_shop (spu_id, shop_id)`——同一商品在同一店铺只能挂一次。驳回后重提是改原行，
不是新建，否则反复驳回会让同一个商品长出一堆记录。`ck_offer_status` 限死六个状态。

索引：`idx_offer_shop_status (shop_id, status)` 服务店铺商品列表。

**状态迁移靠条件更新兜底**：`UPDATE ... WHERE id = :id AND status = :from`，影响 0 行就是别人先改了，
调用方必须当冲突（409），不能吞。这是"先查再改"窗口的防线。

## catalog.offer_review

审核历史，一轮一行，**只追加不删**。`offer` 只存当前状态，过程在这里。

| 字段         | 类型        | 空 / 默认              | 说明                                                                                  |
| ------------ | ----------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `id`         | uuid        | PK，默认 `uuidv7()`    | 记录 id                                                                               |
| `offer_id`   | uuid        | NOT NULL               | 属于哪个 offer                                                                        |
| `round`      | integer     | NOT NULL               | 第几轮审核，从 1 开始。**重提时 +1**（`OfferStore.nextRound` 查已审次数），不是硬编码 |
| `decision`   | text        | NOT NULL               | `approved` / `rejected`                                                               |
| `reason`     | text        | 可空                   | 审核意见。免审自动通过时写 `auto_approve`                                             |
| `reviewer`   | uuid        | 可空                   | 审核人。**自动通过为 null**                                                           |
| `created_at` | timestamptz | NOT NULL，默认 `now()` | 审核时间。这张表没有 `updated_at`——审核记录不改                                       |

约束：`uq_offer_review_round (offer_id, round)`、`ck_offer_review_decision`。

---

## 每个 mapper 碰哪些表 / 列

| 类                    | 操作   | 表                                                 | 列                                                                                                                       |
| --------------------- | ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `CategoryStore`       | SELECT | `category`                                         | `id, parent_id, path, level, code, name, status, sort, created_at, updated_at`                                           |
| `ProductStore`        | INSERT | `spu`                                              | `id, spu_type('merchant'), merchant_id, category_id, brand_id, model_no, identity_kind, match_key, title`                |
| `ProductStore`        | INSERT | `spu`                                              | `id, spu_type('standard'), category_id, brand_id, model_no, identity_kind, match_key, title`（`ON CONFLICT DO NOTHING`） |
| `ProductStore`        | UPDATE | `spu`                                              | `standard_spu_id, standard_matched_by`（`StandardMatcher` 挂载）                                                         |
| `ProductStore`        | INSERT | `sku`                                              | `id, spu_id, spec_values, spec_key, price_amount, price_currency, weight_g, status('active')`                            |
| `ProductStore`        | INSERT | `spu_attr`                                         | `spu_id, attribute_id, value_index(0), value_text`                                                                       |
| `ProductStore`        | SELECT | `spu`                                              | `merchant_id, category_id, brand_id`（发布前校验）                                                                       |
| `ProductStore`        | SELECT | `sku`                                              | `id`（发事件带 SKU 列表）                                                                                                |
| `ProductStore`        | SELECT | `spu` + `spu_attr` + `attribute` + `sku` + `offer` | 买家详情，一条语句聚合，保证同一快照                                                                                     |
| `OfferStore`          | INSERT | `offer`                                            | `id, spu_id, merchant_id, shop_id, status('pending'), submitted_at`                                                      |
| `OfferStore`          | SELECT | `offer`                                            | `id, spu_id, merchant_id, shop_id, status`                                                                               |
| `OfferStore`          | UPDATE | `offer`                                            | `status, approved_at, approved_by, reject_reason`（CASE WHEN 按目标状态决定写不写）                                      |
| `OfferStore`          | SELECT | `offer`                                            | `spu_id, shop_id`（重提前先查"这条 offer 存在吗、什么状态"）                                                             |
| `OfferStore`          | SELECT | `offer_review`                                     | `count(*)`（`nextRound`：重提时算第几轮，不硬编码 1）                                                                    |
| `CatalogQueryImpl`    | SELECT | `sku` + `spu` + `offer`                            | 可售点查，只认 `offer.status='online'` 且 `sku.status='active'`                                                          |
| `CategoryStore`       | INSERT | `category`                                         | `id, parent_id, path, level, code, name, status, sort`                                                                   |
| `CategoryStore`       | SELECT | `category`                                         | 全量树（一次拉全，几千节点）与单节点点查                                                                                 |
| `CategoryStore`       | UPDATE | `category`                                         | `status` / `sort` / `name`                                                                                               |
| `CategoryConfigStore` | INSERT | `category_config`                                  | 叶子配置六项；触发器保证 level = 3                                                                                       |
| `CategoryConfigStore` | SELECT | `category_config`                                  | 一个叶子的完整配置                                                                                                       |
| `CategoryConfigStore` | INSERT | `attribute`                                        | 属性模板；触发器保证 level = 3                                                                                           |
| `CategoryConfigStore` | SELECT | `attribute`                                        | 某叶子的属性模板（列名用 `AS sales_spec` 对齐 record 字段）                                                              |

## 图的唯一真相源

`spu.images` 已删，图只住 `spu_media`：

- 写：`ProductStore.insertSpu` 把商家给的图批量写成 `attribute_id IS NULL` 的通用图
- 读主图：`CatalogQueryImpl` 用子查询取 `attribute_id IS NULL` 里 `sort` 最小的那张。
  **用子查询不用 JOIN**——一个 SPU 有多张图，JOIN 会让结果集出现多行，而 `fetch first 1 row only`
  会让"取哪张图"变成不确定的事
- 读全部：`ProductStore.FIND_DETAIL` 用 `jsonb_agg` 聚成数组，与属性、SKU 同一条语句，快照必然一致

规格图（`attribute_id` + `spec_value`）的结构和约束都在，但还没有写入入口——「选红色就换图」是第二刀。
