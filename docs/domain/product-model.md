# 商品模型

> 回答 [questions.md](../questions.md) 第 8–17 题。落在 `catalog` 模块，schema 同名。
> 模块 README 见 [catalog](../../apps/server/src/main/java/com/shop/platform/catalog/README.md)。

## 1. 一分钟稿

> 商品模型要回答三件事：这个东西是什么、它怎么卖、谁允许它卖。
>
> 所以四层。`spu` 说"是什么"，`sku` 说"哪个具体规格"，`listing` 说"这个商家在哪个店、以什么状态卖"，平台标准品说"它和别家卖的是不是同一个东西"。
>
> 两个反直觉的点。**标准品不能下单**——它只是个标签，把 100 个商家的 SPU 归并成一个，服务比价和聚合，交易链路一个字都不读它。**上架权在平台**——状态机里从 `approved` 到 `online` 那一步只有平台能触发。
>
> 第三个点偏技术：类目树用物化路径，不用无限级 `parent_id`。查子孙是一条 `LIKE`，不是递归 CTE。

## 2. 模型与不变式

```
category（树，物化路径）
  ├── attribute（属性模板，is_sales_spec 决定能不能当规格）
  └── spu ──── spu_attr（属性值）
        │
        ├── standard_spu_id ──→ spu(type=standard)   同款归并，只是标签
        │
        └── sku（规格组合 + 挂牌价）
              │
           listing（在某个 shop 的售卖记录：审核状态 + 上下架状态）
              └── listing_review（每一轮审核留痕）
```

**五条不变式。破了任何一条，后面所有模块都跟着错。**

1. **价格只在商家 SKU 上。** SPU 没有价格，标准品没有价格，`listing` 也没有价格。
2. **标准品不能下单、不能进购物车、不能有库存。** 它没有 SKU。
3. **同一 SPU 下规格组合唯一**，由 `(spu_id, spec_key)` 唯一索引保证，不靠代码查重。
4. **`online` 只能从 `approved` 来**，且只有平台侧动作能触发。免审类目是显式的 `category.auto_approve`，不是"忘了审"。
5. **商品只能挂叶子类目。** 属性模板由类目继承下来。

### 为什么不能合成一张表

`product(id, ..., spec jsonb, price, status)` 这种写法省事，但四件事全做不了：

- 规格要能**过滤**（搜"红色"），JSON 里建不了可用的 B-tree
- 每个规格要**独立定价**（大码贵 5 块）
- 每个规格要**独立管库存**（`inventory` 按 `sku_id` 扣）
- 每个规格要**独立退货**（退一件大码，不是退"商品"）

### 规格 ≠ 属性

|        | 属性                 | 规格                                     |
| ------ | -------------------- | ---------------------------------------- |
| 挂在哪 | SPU                  | SKU                                      |
| 干什么 | 描述、筛选           | 决定买哪一个                             |
| 例子   | 材质、产地、适用季节 | 颜色、尺码                               |
| 谁决定 | 类目模板             | 类目模板里 `is_sales_spec = true` 的那些 |

一个属性能不能当规格，是**类目定的**，不是商家自由发挥。否则同一个类目里有人用"颜色"有人用"色系"，搜索和筛选全废。

### 标准品是什么、不是什么

- **是**：一个归并标签。`spu.standard_spu_id` 指向一个 `type = standard` 的 SPU，用来做同款比价、评论聚合、正品溯源。
- **不是**：一个商品。它没有 SKU、没有价格、没有库存、不能下单。
- **怎么挂**：MVP 只做两件事——条码/UPC 精确匹配，加人工挂靠。图像相似度、型号解析都不做。

## 3. 表与状态机

八张表。前五张是 module-map 里列的"核心表"，后三张是它们撑不住的地方。

### category

```sql
id          uuid PRIMARY KEY DEFAULT uuidv7(),
parent_id   uuid,                -- 根为 null
path        text NOT NULL,       -- 物化路径 '/a1b2/c3d4/'，含自己
level       smallint NOT NULL,   -- 1..4
code        text NOT NULL,
name        text NOT NULL,
is_leaf     boolean NOT NULL,
auto_approve boolean NOT NULL DEFAULT false,   -- 该叶子类目免审
status      text NOT NULL,       -- enabled | disabled
```

约束：`uq_category_path`、`uq_category_code`、`CHECK (level BETWEEN 1 AND 4)`。

**为什么是物化路径**：

- 查整棵子树：`WHERE path LIKE '/a1b2/%'`，一条索引扫描。递归 CTE 每次都要递归，深度一多就慢。
- 移动节点：改自己这一行的 `path`，后代跟着变——用 `UPDATE ... WHERE path LIKE '/old/%'` 批量替换前缀，一次搞定。
- 防环：新 parent 的 `path` 里如果包含自己，直接拒。
- 不做无限级：属性模板要逐层继承，层数一多继承链就没法讲了。四层够用（大类 → 子类 → 叶子 → 更细的叶子）。

### attribute

```sql
id            uuid PRIMARY KEY DEFAULT uuidv7(),
category_id   uuid NOT NULL,
code          text NOT NULL,
name          text NOT NULL,
value_type    text NOT NULL,     -- text | number | enum | bool
is_sales_spec boolean NOT NULL DEFAULT false,
is_required   boolean NOT NULL DEFAULT false,
is_multi      boolean NOT NULL DEFAULT false,
options       jsonb,             -- enum 的值域
```

索引 `idx_attribute_category`。继承规则写在代码里：查某类目的全部属性 = 自己 + 所有祖先，按 `level` 去重，子类目可以覆盖同 `code` 的定义。

### brand

```sql
id uuid PRIMARY KEY DEFAULT uuidv7(),
name text NOT NULL,
owner_type text NOT NULL,        -- platform | merchant
status text NOT NULL             -- pending | approved | rejected
```

品牌也有审核：商家可以提自己的品牌，平台批。批之前不能用在 `online` 商品上。

### spu

```sql
id               uuid PRIMARY KEY DEFAULT uuidv7(),
spu_type         text NOT NULL,     -- merchant | standard
merchant_id      uuid,              -- standard 时为 null；也是分片键
shop_id          uuid,
category_id      uuid NOT NULL,     -- 必须是叶子
brand_id         uuid,
standard_spu_id  uuid,              -- 仅 merchant 有；指向 type=standard 的行
standard_matched_by text,           -- manual | barcode
title            text NOT NULL,
images           jsonb,
status           text NOT NULL      -- draft | online | offline
```

索引：`idx_spu_merchant`、`idx_spu_category`、`idx_spu_standard`。

`spu.status` 只是个摘要，**真正的售卖状态在 `listing`**。两者不一致时以 `listing` 为准。

### spu_attr

```sql
spu_id       uuid NOT NULL,
attribute_id uuid NOT NULL,
value_text   text,
value_num    numeric,
value_bool   boolean,
PRIMARY KEY (spu_id, attribute_id)
```

索引 `idx_spu_attr_value (attribute_id, value_text)`——这条索引就是"筛选"的落点。

### sku

```sql
id           uuid PRIMARY KEY DEFAULT uuidv7(),
spu_id       uuid NOT NULL,
spec_values  jsonb NOT NULL,    -- [{"attributeId":"…","value":"红色"}, …]
spec_key     text NOT NULL,     -- 规格值排序后拼的串，只为加唯一索引
barcode      text,
price_amount bigint NOT NULL,   -- 分
price_currency char(3) NOT NULL DEFAULT 'CNY',
weight_g     integer,
status       text NOT NULL      -- active | disabled
```

约束：`uq_sku_spec (spu_id, spec_key)`、`CHECK (price_amount >= 0)`。

**`spec_key` 是唯一性的唯一来源。** 商家提交时由服务端按 `attribute_id` 排序拼出来，客户端的顺序不作数——否则"红/L"和"L/红"会被当成两个 SKU。

**规格组合不存在，就是表里没这行。** 不存"禁用组合"表：红色只有 S/M，就只建两行 SKU，前端拿到全部 SKU 后自己把 L 灰掉，并区分"不存在"和"存在但没库存"两种灰。

**价格差异也在这儿**：大码贵 5 块就是两条 SKU 行的 `price_amount` 不同。所以价格必须在 SKU 上，不在 SPU 上。

### listing

```sql
id           uuid PRIMARY KEY DEFAULT uuidv7(),
spu_id       uuid NOT NULL,
merchant_id  uuid NOT NULL,     -- 分片键
shop_id      uuid NOT NULL,
status       text NOT NULL,     -- draft | pending | approved | rejected | online | offline
reject_reason text,
submitted_at timestamptz,
approved_at  timestamptz,
approved_by  uuid,
```

约束：`uq_listing_spu_shop (spu_id, shop_id)`——同一商品在同一店铺只有一条售卖记录。

状态机：

```
draft ──提交──→ pending ──通过──→ approved ──上架──→ online
                  │                                   │
                  └──驳回──→ rejected ──改完重提──→ pending
                                                      │
                       offline ←── 商家主动下架 / 平台强制下架 ┘
```

三处只有平台能动：`pending → approved`、`pending → rejected`、`approved → online`（免审类目例外，系统代劳）。

### listing_review

```sql
id         uuid PRIMARY KEY DEFAULT uuidv7(),
listing_id uuid NOT NULL,
round      integer NOT NULL,
decision   text NOT NULL,     -- approved | rejected
reason     text,
reviewer   uuid,
created_at timestamptz NOT NULL DEFAULT now()
```

**驳回后重提是改原 `listing`，不是新建一条。** 否则同一个商品会因为反复驳回长出一堆记录，`uq_listing_spu_shop` 也保不住。审核过程记在 `listing_review` 里，一轮一行，`round` 自增，历史不删。

## 4. 关键时序

### 正常流：商家发一个商品

```
商家             catalog                       search / trust
 │
 ├─ 建 SPU（draft）→ 选类目（叶子）→ 填属性值
 ├─ 建 SKU × N（规格组合 + 价格）
 ├─ 提交 ─────────→ 建 listing(status=pending)
 │                     │
 │                     ├─ trust 校验：这个商家有没有该类目授权
 │                     ├─ 校验：属性必填项、品牌是否已批、SKU 至少一条
 │                     └─ 类目 auto_approve?
 │                          ├─ 是 → approved → online
 │                          └─ 否 → 等平台审
 │
 │  ← 驳回（带 reason，listing_review 记一轮）
 │  → 改 SPU/SKU → 重提（同一条 listing 回 pending，round+1）
 │
 ├─ 通过 ────────────────────────→ online
 │                                    └─ 发 OfferPublished →─→ search 建索引
```

`OfferPublished` 带着 `offerId / sellerId / skuId / categoryId / price`。`search` 只认这条事件，不反查 `catalog`。

### 异常流一：平台强制下架

信任模块判定违规，或类目授权被吊销（`CategoryGrantRevoked`）。

```
trust → listing.status = offline（平台动作）
      → 发 OfferOffline(reason)
      → search 删索引
      → 在途订单不动（订单里是快照）
```

**在途订单不因为商品下架而中断。** 已经成交的履约照走，售后照受理。

### 异常流二：类目迁移

商品从 A 类目挪到 B 类目，不能直接 `UPDATE category_id`。要走一次下架重审：

```
offline → 改 category_id / 重填 B 类目的必填属性 → pending → approved → online
```

因为三件事会同时变：属性模板换了（老属性值可能非法）、类目授权可能没有（要问 `trust`）、搜索索引要重建。直接改会让搜索里挂着一条字段对不上的文档。

### 异常流三：商家改价

```
商家改 sku.price_amount
  → 不影响已成交订单（订单里是快照）
  → 影响购物车（购物车不锁价，结算时按新价算）
  → 影响搜索展示（价格变了要重建索引，走 OfferPublished 的更新态）
```

## 5. 失败模式与未决

### 会错在哪

| 现象                           | 根因                         | 怎么防                                    |
| ------------------------------ | ---------------------------- | ----------------------------------------- |
| 同一 SPU 下两个 SKU 规格撞车   | 唯一性靠代码查重，并发下漏了 | `uq_sku_spec` 兜底                        |
| "红/L" 和 "L/红" 建成两条      | 客户端拼 `spec_key`          | 服务端排序后拼                            |
| 类目树成环                     | 移动节点没校验               | 新 parent 的 `path` 含自己就拒            |
| 标准品挂错，比价全乱           | 自动匹配没有置信度           | MVP 只做条码精确匹配 + 人工               |
| 商品下架了但搜索还搜得到       | 事件发出去 `search` 没消费   | outbox 重试 + 索引侧校验 `listing.status` |
| 属性模板改了，老商品属性对不上 | 模板无版本                   | 模板改动只增不删，删属性走下线            |
| 商品删了，购物车里还引用着     | 跨模块无外键                 | 购物车读取时容忍缺失，标记失效            |

### 还没想清

- **标准品要不要做到 SKU 级。** 现在只到 SPU，"iPhone 16 Pro 256G 原色"这种同款不同规格没法归并。等有真实商品数据再定。
- **多规格图。** 选红色换一套图，现在 `spu.images` 存不下，可能要 `sku.images` 或独立的 `spu_media`。
- **类目属性多层继承的取舍。** 现在是"子类目覆盖同 `code`"，如果出现"子类目想删掉父类目的属性"就没法表达。
- **品牌审核归 `catalog` 还是 `trust`。** 现在放 `catalog`，但品牌资质（授权书）本质是治理问题。

---

## 答案在哪

| 题                                | 落点                                        |
| --------------------------------- | ------------------------------------------- |
| 8 SPU/SKU/商家商品/标准品怎么建模 | §2 四层 + §3 表；"为什么不能合成一张表"     |
| 9 规格组合不存在怎么表达          | §3 `sku`：没这行就是不存在；`spec_key` 唯一 |
| 10 规格和属性怎么区分             | §2 表格 + `attribute.is_sales_spec`         |
| 11 100 个商家卖同一款怎么认       | §2 标准品；`spu.standard_spu_id`            |
| 12 标准品怎么匹配、错配怎么纠     | §2「怎么挂」+ §5 未决                       |
| 13 审核状态机、驳回重提           | §3 状态机 + `listing_review`                |
| 14 上架权在谁手里                 | §2 不变式 4 + `category.auto_approve`       |
| 15 改价改标题后老订单显示什么     | §4 异常流三；真正的答案在订单快照           |
| 16 类目树怎么存                   | §3「为什么是物化路径」                      |
| 17 类目迁移牵连什么               | §4 异常流二                                 |
