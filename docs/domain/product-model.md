# 商品模型

> 回答 [questions.md](../questions.md) 第 8–17 题。落在 `catalog` 模块，schema 同名。
> 模块 README 见 [catalog](../../apps/server/src/main/java/com/shop/platform/catalog/README.md)。

## 1. 一分钟稿

> 商品模型要回答三件事：这个东西是什么、它怎么卖、谁允许它卖。
>
> 一套模型装四类商品——品牌标品、品牌非标、白牌标品、白牌非标。四类的差别不在表结构，在三个类目级配置：识别键是什么、要不要求品牌、能不能归并同款。**象限是推导出来的标签，不是存的字段。**
>
> 类目是整棵树的骨架。属性模板挂它、标准品挂它、佣金和资质也指向它——但物理上只有属性模板和标准品归 `catalog`，佣金和授权归 `governance`。类目只是被引用，不持有。
>
> 商品分四层：`spu` 说是什么，`sku` 说哪个规格，`listing` 说这个商家在哪个店以什么状态卖，标准品说它和别家的是不是同一个东西。两个反直觉的点：**标准品不能下单**，**上架权只在平台**。

## 2. 模型与不变式

### 2.1 四象限：一套模型，四档配置

四类商品必须全支持，但代码里不为任何一类写分支。先看四个真实例子，同一套结构。

**① 品牌标品 · iPhone 16 Pro**

```
类目    手机 › 智能手机
属性    品牌=Apple · 型号=A3294 · 屏幕=6.3" · 上市=2024
识别键  SPU 型号 A3294；SKU 条码 GTIN 0195949xxxxxxx —— 型号认商品，GTIN 认规格
SKU     容量×颜色 = 6 条，¥7999 / ¥8999 / ¥9999
标准品  自动挂。全平台 200 个商家指向同一个 standard_spu
审核    品牌授权书 + 3C
```

**② 品牌非标 · 优衣库 UT**

```
类目    服饰 › 男装 › T恤
属性    品牌=UNIQLO · 款号=466123 · 季节=2024SS · 版型=宽松
识别键  品牌+款号 —— 没有统一条码，款号是品牌自己编的
SKU     4 色 × 5 码 = 20 条，同价，各自独立库存
标准品  半自动。款号会重号（2023 和 2024 都可能有 466123），要先人工确认一次
审核    品牌授权书
```

**③ 白牌标品 · 无牌数据线**

```
类目    数码配件 › 数据线
属性    品牌=无 · 长度=1m · 功率=60W · 接口=C to C · 材质=尼龙
识别键  参数组合本身。四项全相同 = 同款
SKU     1 条（单规格商品）；也可能把"长度"做成 SKU，2 条
标准品  自动挂，按参数哈希归并
审核    质检报告（GB 4943）
```

**④ 白牌非标 · 产业带连衣裙**

```
类目    女装 › 连衣裙
属性    品牌=无 · 风格=法式 · 领型=方领 · 面料=雪纺
识别键  没有。认不出来。
SKU     8 色 × 5 码 = 40 条，还能再乘一层"款式"
标准品  挂不上，standard_spu_id 永远为空
审核    抽检 + 类目准入（实拍图 + 尺寸表）
```

**一眼看出区别**

|            | 品牌标品    | 品牌非标    | 白牌标品       | 白牌非标     |
| ---------- | ----------- | ----------- | -------------- | ------------ |
| 识别键     | 型号 + GTIN | 品牌+款号   | 参数组合       | 无           |
| SKU 数量级 | 个位        | 几十        | 个位           | 几十到几百   |
| 归并       | 机器        | 半自动      | 机器           | 不做         |
| 比价       | 有          | 弱          | **最强**       | 没有         |
| 属性约束   | 型号必填    | 款号必填    | 参数必须结构化 | 只要图和标题 |
| 主要售后   | 假货        | 尺码 / 色差 | 质量           | 图文不符     |

三个能直接用的结论：

- **白牌标品是价格战最凶的地方**——白牌之间没有差异，参数一样就只能比价。这类目的排序要压低店铺分权重。
- **白牌非标没有同款，就没有比价**，只能靠推荐流和店铺权重。`search` 的排序策略必须按类目分两套。
- **品牌非标的款号会重号**，靠"品牌+款号"归并会错配，必须留人工确认这一环。

**象限怎么算出来**

```
quadrant = f(brand_id 是否有值, spu.identity_kind)
```

不存 `quadrant` 字段。存的是 `identity_kind` 和 `brand_id`，标签在展示层推导。理由：象限是分析口径，不是业务事实；存下来就有第二处真相。

**识别键分两级**

| 象限     | SPU 级（型号级）          | SKU 级（规格级）  |
| -------- | ------------------------- | ----------------- |
| 品牌标品 | 型号 `APPLE:A3294`        | GTIN              |
| 品牌非标 | 品牌+款号 `UNIQLO:466123` | 无                |
| 白牌标品 | 参数组                    | 参数哈希 + 规格值 |
| 白牌非标 | 无                        | 无                |

两个键用途不同，不要合并：

- **`spu.match_key`** 建标准品、认"这是不是同一个型号"。标准品是 SPU 级实体。
- **`sku.identity_key`** 做比价。"iPhone 16 Pro 从 ¥7999 起"在 128G 和 256G 混卖时是误导，价格对比必须落到规格。

**GTIN 天生是 SKU 粒度的**——每个颜色容量组合一个独立条码。把它挂在 SPU 上就是把键放错了层级。

**架构：统一到什么程度**

```
catalog —— 统一的事实模型
├── 配置层   category / category_config / attribute / brand
├── 事实层   spu / sku / listing      ← 四类同构，一套表
└── 策略     IdentityKeyResolver    ← 类目配置决定怎么认商品
              ├── 品牌:型号          品牌标品
              ├── 品牌:款号          品牌非标
              ├── 参数哈希           白牌标品
              └── none               白牌非标
```

不独立成模块的三块：**标准品库**（平台自己的主数据，生命周期不同，但物理先住 `catalog`）、**比价聚合**（跨商家查询，属 query 侧）、**授权与资质**（归 `governance`）。

**为什么不做两套模型。** 拆成"标品一套、白牌一套"要复制五样：类目树、属性模板、`listing` 状态机、审核流、发布事件。五处各自分叉，最后就是两个系统。而四类真正不同的只有三个枚举值。更实际的一条：同一个商家常常既卖品牌货又卖白牌货，两套模型就是两个发布后台、两次审核。

**什么时候拆。**

| 触发条件                                   | 拆什么                                           |
| ------------------------------------------ | ------------------------------------------------ |
| 标准品超过 10 万条，或出现专职"标准品运营" | 标准品库独立成模块                               |
| 出现平台自营（1P）                         | 必须新模块——自营的库存、价格、结算与 3P 完全不同 |
| 虚拟商品 / 服务类                          | 商品模型可复用，`listing` 的履约绑定要拆         |

前两条是可逆的：标准品表现在住在 `catalog` 里，将来拆出去是搬 schema，模型不用改。

**判据一句话：数据形状同构就统一，生命周期不同就拆。** 四象限形状同构、生命周期也相同（商家建 → 平台审 → 卖 → 下架），所以统一。标准品形状同构但生命周期是"平台建 → 平台审 → 错配申诉 → 下市"，所以它是第一个该拆的候选。

### 2.2 类目：挂载骨架

类目看着只是棵树，实际上是整个商品模型的挂载点。类目设计错了，商品、搜索、结算、治理全要返工。

#### 2.2.1 树怎么存

| 方案                        | 查子树               | 查祖先        | 写入                         | 判断     |
| --------------------------- | -------------------- | ------------- | ---------------------------- | -------- |
| 邻接表 `parent_id`          | 递归 / 多次查询      | 递归          | 简单                         | 不选     |
| **路径枚举** `path='/a/b/'` | `LIKE '/a/%'` 走索引 | 解析字符串    | 改父节点要批量改写子树前缀   | **选它** |
| 嵌套集 `lft/rgt`            | 范围查询，快         | 范围查询，快  | 插入 / 移动要重算大量节点    | 不选     |
| 闭包表 `closure(a,d)`       | JOIN 一次，快        | JOIN 一次，快 | 多一张表，改树要同步维护关系 | 不选     |

选路径枚举，三条理由：

- **规模对不上**：3 层、几千个节点、一年改几十次。闭包表的优势在任意深度和 DAG（一个节点多个父），我们是定长浅树，用不上。
- **少一张表就少一处不一致**：闭包表要求"改树"和"改闭包"永远同事务，多一个能写错的地方。
- **PG 的原生支持够用**：`path text_pattern_ops` 上的索引让 `LIKE '/a/%'` 是范围扫描，不是全表扫。查祖先在应用层 split 字符串，一次库都不用查。

不选无限级 `parent_id`：递归查询深度一大就慢，改父节点整棵子树路径都变、缓存全失效。**业务上类目深度本来就有上限，无限级是过度设计。**

硬约束：`level BETWEEN 1 AND 3`，`path` 唯一（含自己，段数 = level），`code` 唯一且不可变。

**只有第 3 层（叶子）能挂商品，也只有它能有配置。** 前两层是纯分组：它们只回答"在哪"，不回答"要求什么"。这个分工落到表上就是 `category`（树）与 `category_config`（叶子配置）两张表——`identity_keys` 这类字段只对能挂商品的类目有意义，平铺在每一行上时 L1/L2 那些值永远是 NULL、永远不被读，而"L1 配了会怎样"会变成一个需要写解析器回答的问题。拆开之后它不存在了。

**不存 `is_leaf`。** 三层定死之后"是不是叶子"就是 `level = 3`。存一份就多一个会漂移的真相源——而原来那份确实漂了：插子类目时没人把父类目改成 `false`，于是发布闸门靠它拦「往非叶子挂商品」这件事从来没真正生效过。

#### 2.2.2 前台类目 vs 后台类目

两棵树，职责不同：

|          | 后台类目（`category`）     | 前台类目（`front_category`） |
| -------- | -------------------------- | ---------------------------- |
| 管什么   | 属性模板、标准品、资质要求 | 浏览、搜索筛选、会场导航     |
| 谁维护   | 平台运营，低频             | 运营 / 商品，可季节性调整    |
| 稳定性   | 极稳，改一次影响面大       | 灵活，可以随时调             |
| 商品挂哪 | 商品挂后台类目             | 不挂商品，只做展示入口       |

两者**多对多**，靠 `front_category_map` 关联。同一个后台类目"手机通讯 › 智能手机"，前台可以拆成"手机 › 5G 手机"和"手机 › 折叠屏"两个入口。

为什么必须分：合成一套的话，运营调一次展示分类就会牵动佣金规则和属性模板，风险完全不成比例。

**但分离有代价**：一张映射表、搜索文档要存两个类目 id、运营要维护两套。所以现在的做法是：**建表，不建功能**。

前台类目由脚本从后台 1:1 生成，后台**不提供前台类目的编辑入口**。没有入口，就没有两套流程要维护。

三条触发条件，命中任意一条才把编辑功能打开：

1. 同一个后台类目要出现在 ≥2 个前台入口
2. 要做季节性会场（双 11、夏季专区）
3. 同一个类目下要按不同权重排序

#### 2.2.3 类目上挂什么，谁持有

这一段最容易写崩。逻辑上类目是挂载点，**物理上归属不同模块**：

| 挂载物                    | 持有者                            | `catalog` 怎么用                              |
| ------------------------- | --------------------------------- | --------------------------------------------- |
| 属性模板                  | **`catalog`**                     | 自己持有                                      |
| 标准品                    | **`catalog`**                     | 自己持有                                      |
| 佣金 / 费率模板           | `governance`                      | 不读。下单时由 `trade` 从 `governance` 取     |
| 商家类目授权              | `governance`                      | 发布时调 `governance :: api` 校验             |
| 品牌授权                  | `governance`                      | 发布时调 `governance :: api` 校验             |
| 类目资质要求（3C / 食品） | `catalog` 存代码，`governance` 判 | 存 `qualification_codes`，判权交 `governance` |
| 搜索筛选项                | `search`                          | 只提供 `attribute.is_filterable`              |

如果照"类目挂六类东西"字面实现，`catalog` 会把佣金、授权、资质全吞进来，模块边界当场崩。

品牌这条要单独说：**`catalog` 管品牌是什么，`governance` 管谁能卖。** 判断"能不能卖"要读 `governance` 的违规扣分、冻结、保证金状态，放 `catalog` 就得反向调 `governance` 三四个接口，还和已有的类目授权逻辑打岔。`governance` 存授权关系时只把 `brand_id` 当 uuid 用，不需要知道品牌叫什么，不产生跨模块读。

#### 2.2.4 属性模板：不做继承

**属性模板只挂在叶子上，一个类目一套，不沿祖先链合并。**

这条是改过的决定。原来设计的是"父类目加属性、子类目自动继承"，配套三条约束（子类目不能删父类目的属性、不能把必填改可选、不能把识别属性改成非识别）。那三条本质是在防"继承来的配置被改坏"——**没有继承就没有这个风险**。

为什么砍掉：

- **继承要写解析器。** 三个布尔取祖先链 OR、其余取最近定义，每个合并函数都是一处可能写错的地方；而它带来的问题（"L1 配了会怎样"）本身也是继承造出来的。
- **运营实际怎么干活。** 配一个叶子类目时本来就要从头想清楚"这个格子要填什么"。真正省事的是**从同类目复制一份再改**，不是运行时继承。
- **复制是显式的、可 diff 的；继承是隐式的、要沿链算的。** 类目配置一年改几次，复制完全够用。

所以配一个叶子类目 = 一次给齐属性模板 + 识别键 + 品牌策略 + 资质 + 审核策略。这五项是出厂设置，后补代价极高——补的时候存量商品没有这些值。识别键尤其致命：白牌标品类目要是没定识别属性，参数哈希拼不出来，同款全归并错，而错配只能人工一条条修。

#### 2.2.5 识别属性必须用值域

`identity_keys` 里含 `param_hash` 的类目，它的 `is_identity` 属性**必须**是 `enum` 或 `number`，不能是自由文本。库里有 `CHECK (NOT is_identity OR value_type IN ('enum','number'))` 兜底。

"TypeC" / "Type-C" / "USB-C" 是三个值，三条商品就成了三个同款，比价直接失效。**规范化做在写入侧，不做在匹配侧**——哈希只负责把已经规范化的值拼起来，不承担清洗。

数字型属性要带单位（`attribute.unit`），否则 1m 和 100cm 还是两个值。枚举型必须有值域（`catalog.attribute_value` 至少一个 active 值，或 `allow_custom = true`），否则枚举等于自由文本。这两条由 service 校验兜底。

**值域同时约束 SKU 规格值。** 类目给「存储」定了 `128G / 256G`，SKU 传 `512G` 必须被拒——否则值域只是一句建议：搜「128G」搜不到那个商品（它的 `spec_values` 是 512G），而买家看到的规格也是 512G。发布闸门 `checkSpecAttributes` 同时校验"这个属性能不能当规格"和"取值在不在值域内"。

值域谁维护：类目运营。定值域本来就是建类目的活，但只对"要比价的类目"强制——全平台类目都做值域会把运营拖死。

#### 2.2.6 条件可见：单层依赖

属性可以带 `visible_when`：被依赖属性取到指定值时，这个属性才出现。规则形状
`{attributeId, operator, values}`，`operator` 只收 `eq / neq / in`。

**只允许单层。** 被依赖属性自己不能再带规则，销售规格属性也不能当依赖源——多层依赖要拓扑排序
并处理环，运营配置用不上，复杂度却会翻几倍。规则只存不求值：后端在改属性时校验合法性，
前端按当前填写值展开。隐藏的属性不参与校验、不提交，但值保留在表单里，条件切回来还在。

**所有识别属性必须齐全，而且必须必填。** `IdentityKeyResolver` 只在每个 `is_identity` 属性都有值时
才拼参数哈希；缺一项就返回「认不出来」，不生成短哈希。用填了的那几项拼键，会和另一个同样漏填、
实际参数不同的商品撞成同款——挂不上只是少一组比价，挂错了是比价列表里混进不相干的东西。
类目配置在创建 / 改配置 / 加属性三处都校验这条。

**多值属性拼键时值排序后拼接。** 取值顺序不影响 `match_key`；`is_sales_spec` 属性不能是多值——
规格维度必须单值才能拼 `spec_key`。

#### 2.2.6 类目变更

四种变更，全走审批 + 影响面评估 + 审计：

| 变更 | 做什么                                                                       |
| ---- | ---------------------------------------------------------------------------- |
| 新增 | 草稿类目 → 配属性模板 + 资质要求 + 识别键策略 → 审核生效                     |
| 合并 | A 并入 B。迁标准品、商品、商家授权、佣金规则；历史订单快照不动；记映射可回滚 |
| 拆分 | A 拆成 A1 / A2。按属性值规则或人工决定每个标准品和商品的去向                 |
| 停用 | `status = frozen`：禁止新商品挂入，存量卖完为止（可配成 `closed` 直接停卖）  |

合并和拆分必须落一张 `category_migration`，记清楚"谁迁到哪、迁了多少、能不能退"。没这张表，出事之后没人能手工还原。

**`code` 不可变。** ERP 和开放平台拿它对接，改一次外部系统全断。改名可以，改 `code` 不行。

### 2.3 商品四层

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

**为什么不能合成一张表。** `product(id, ..., spec jsonb, price, status)` 省事，但四件事全做不了：

- 规格要能**过滤**（搜"红色"），JSON 里建不了可用的 B-tree
- 每个规格要**独立定价**（大码贵 5 块）
- 每个规格要**独立管库存**（`inventory` 按 `sku_id` 扣）
- 每个规格要**独立退货**（退一件大码，不是退"商品"）

**规格 ≠ 属性**

|        | 属性                 | 规格                          |
| ------ | -------------------- | ----------------------------- |
| 挂哪   | SPU                  | SKU                           |
| 干什么 | 描述、筛选           | 决定买哪一个                  |
| 例子   | 材质、产地、适用季节 | 颜色、尺码                    |
| 谁定   | 类目模板             | 类目模板里 `is_sales_spec` 的 |

一个属性能不能当规格，是类目定的，不是商家自由发挥。否则同一个类目里有人用"颜色"有人用"色系"，搜索和筛选全废。

**标准品是什么、不是什么**

- **是**：一个归并标签。`spu.standard_spu_id` 指向 `type = standard` 的 SPU，服务同款聚合、评论聚合、正品溯源。
- **不是**：一个商品。没有 SKU、没有价格、没有库存、不能下单。
- **怎么挂**：SPU 级认型号（`spu.match_key`），SKU 级认 GTIN（`sku.identity_key`）。比价走 SKU 级，商品页聚合走 SPU 级。
- **不建标准 SKU 表**：GTIN 和参数哈希本身就是全局键，按它们 `GROUP BY` 就能比价，多一张表只是多一处要同步。

### 2.4 六条不变式

破了任何一条，后面所有模块跟着错。

1. **价格只在商家 SKU 上。** SPU 没有价格，标准品没有价格，`listing` 也没有价格。
2. **标准品不能下单、不能进购物车、不能有库存。** 它没有 SKU。
3. **同一 SPU 下规格组合唯一**，由 `(spu_id, spec_key)` 唯一索引保证，不靠代码查重。
4. **`online` 只能从 `approved` 来**，且只有平台侧动作能触发。免审类目是显式的 `auto_approve`。
5. **商品只能挂叶子类目；标准品也只能挂叶子类目。** 非叶子类目的属性模板有歧义，识别键定不下来。
6. **比价只按 `sku.identity_key` 聚合，不按 SPU。** 拿 SPU 最低价比价，等于拿 128G 的价和 256G 的价比。

## 3. 表与状态机

十四张表。前五张是 module-map 里列的"核心表"：`category` `attribute` `spu` `sku` `listing`。

其余九张是它们撑不住的地方：`category_config` `brand` `spu_attr` `spu_media` `listing_review` `front_category` `front_category_map` `category_migration` `category_migration_item`。

**已落 10 张**（category / category_config / attribute / brand / spu / spu_attr / spu_media / sku / listing / listing_review）；前台类目两张与类目迁移两张是第二刀。

### category

只描述"在哪"，没有任何配置。

```sql
id         uuid PRIMARY KEY DEFAULT uuidv7(),
parent_id  uuid,                      -- 根为 null
path       text NOT NULL,             -- '/a1b2c3d4/e5f6/'，含自己，段数 = level
level      smallint NOT NULL,         -- 1..3，3 是叶子
code       text NOT NULL,             -- 对外稳定标识，不可变
name       text NOT NULL,
status     text NOT NULL DEFAULT 'draft',  -- draft | active | frozen | closed
sort       integer NOT NULL DEFAULT 0      -- 同级顺序
```

约束：`uq_category_path`、`uq_category_code`（不可变）、`CHECK (level BETWEEN 1 AND 3)`、`CHECK (status IN (...))`、以及一条 `ck_category_path_shape`——`path` 必须含自己的 id、且 `level = 路径段数`。这条一起挡住「手工灌出来的歪树」。

索引：`idx_category_parent_sort (parent_id, sort)`、`idx_category_path_prefix (path text_pattern_ops)`。

**`draft` 是必须的。** 叶子建好时配置可能还没配齐，`draft` 就是那个"还不能挂商品"的中间态。前两层建好即 `active`（它们没有配置要配）。

**四个状态落到查询上的分工**：新建草稿与新 listing 要求 `mountable`（叶子 + `active`）；
编辑已有商品要求 `sellable`（`active | frozen`）；`closed` 从可售点查、买家列表、详情、比价里
全部消失，算价与下单拿不到它。`frozen` 只拦新挂入，存量卖完为止。

### category_config

只对第 3 层存在，一行一个类目。**没有继承、没有沿链合并。**

```sql
category_id         uuid PRIMARY KEY,
identity_keys       text[] NOT NULL,      -- 类目允许的 SPU 识别键
sku_identity_kinds  text[] NOT NULL,      -- 类目允许的 SKU 识别键
match_strategies    text[] NOT NULL DEFAULT '{}',
brand_policy        text NOT NULL DEFAULT 'optional',
qualification_codes text[] NOT NULL DEFAULT '{}',
auto_approve        boolean NOT NULL DEFAULT false
```

**「只有叶子能有配置」由触发器保证**，不是纪律：`catalog.require_leaf_config()` 在 INSERT/UPDATE 时读 `category.level`，不等于 3 直接抛错。属性模板同理（`catalog.require_leaf_attribute()`）。这样即使有人绕过 API 直接写 SQL，也插不进去。

**四象限在数据里长这样**：

| 类目              | `identity_keys`（SPU）   | `sku_identity_kinds`（SKU） | `brand_policy` |
| ----------------- | ------------------------ | --------------------------- | -------------- |
| 手机 › 智能手机   | `{model_no}`             | `{gtin}`                    | `required`     |
| 服饰 › T恤        | `{model_no, article_no}` | `{gtin}`                    | `required`     |
| 数码配件 › 数据线 | `{param_hash}`           | `{gtin, param_hash}`        | `optional`     |
| 女装 › 连衣裙     | `{none}`                 | `{none}`                    | `optional`     |

**两列必须分开。** SPU 只认型号、款号、参数哈希——这三样能指认"这是不是同一个商品"；SKU 才认 GTIN——它指认的是"这是不是同一个规格"。混成一列，就会出现"用 GTIN 去挂标准品"这种挂不上的路径。库里有 `CHECK` 挡：`gtin` 只能出现在 `sku_identity_kinds`。

数据线这类目同时有品牌货和白牌货：品牌货的 SPU 走参数哈希、SKU 走 GTIN；白牌货两头都走参数。**这就是为什么识别键必须是类目级的候选列表，而不是一列枚举。**

**候选列表要配优先级。** 一个类目同时声明 `model_no` 和 `param_hash` 时，谁说了算必须是运营定的——`match_strategies` 就是这个顺序，`IdentityKeyResolver` 按它往下试，第一个拼出键的胜出。不配就按 `identity_keys` 的声明顺序。

白牌标品类目要把 `param_hash` 放前面：填了型号的白牌货会按型号归并，而型号是商家自己编的、各编各的，归并出来是一堆单例标准品。反过来，品牌标品类目要把 `model_no` 放前面——参数哈希会因为"某个属性商家没填"而漏归并，型号不会。

### attribute

```sql
id            uuid PRIMARY KEY DEFAULT uuidv7(),
category_id   uuid NOT NULL,
code          text NOT NULL,
name          text NOT NULL,
value_type    text NOT NULL,       -- text | number | enum | bool
allow_custom  boolean NOT NULL DEFAULT false,  -- enum 允许商家追加值
is_sales_spec boolean NOT NULL DEFAULT false,
is_required   boolean NOT NULL DEFAULT false,
is_identity   boolean NOT NULL DEFAULT false,   -- 参与识别键
is_filterable boolean NOT NULL DEFAULT false,   -- 进筛选面板，可比价
is_multi      boolean NOT NULL DEFAULT false
```

值域不再是一个 `jsonb` 字符串数组，而是 `catalog.attribute_value`：
`id`（稳定 id）、`value`、`image_url`、`sort`、`source`（`platform` / `seller`）、`status`、
`created_at`，唯一索引 `(attribute_id, lower(value))`。

**值文本创建后不改名。** `spec_key` / 参数哈希用的是文本，改名等于换规格；要换就停用旧值、
新建新值。存量复验认全部值（停用后已用它的商品仍能重新上架），新写入只认 `active` 值。
`allow_custom = true` 时商家提交的新枚举值会落成 `source = 'seller'` 的行。

索引 `idx_attribute_category`，唯一约束 `uq_attribute_code (category_id, code)`——同一个类目下属性 code 只能有一个，继承去重和 `spu_attr` 都靠它。

`is_identity` 是白牌标品的命门：数据线类目里"长度/功率/接口/材质"四个属性必须 `is_identity = true`，才能拼出参数哈希。少标一个，同款就归并错了。

**`is_multi` 真的能存多个值。** 创建 / 编辑商品时同一个 `attributeId` 在 `attributes` 里出现多次，
落库按 `value_index` 递增；非多值属性出现两次会被拒。`is_sales_spec` 属性不能是多值——
规格维度是 SKU 的一个坐标，必须单值才能拼 `spec_key`。

**属性模板在类目有商品之后只允许安全修改。** 改名、筛选、排序、上下线可选属性随时可以；
识别 / 规格 / 必填属性的增删与上下线、必填与多选的变更会改存量数据的解释方式，锁死。
识别键、匹配策略、SKU 识别键同理——改它们让存量 `match_key` / `sku.identity_key` 全部失效。

### brand

```sql
id         uuid PRIMARY KEY DEFAULT uuidv7(),
name       text NOT NULL,
owner_type text NOT NULL,     -- platform | merchant
status     text NOT NULL      -- pending | approved | rejected
```

品牌授权（谁能在这个类目卖这个品牌）归 `governance`，`catalog` 只存品牌本身。

### spu

```sql
id                  uuid PRIMARY KEY DEFAULT uuidv7(),
spu_type            text NOT NULL,       -- merchant | standard
merchant_id         uuid,                -- standard 为 null；也是分片键
category_id         uuid NOT NULL,       -- 必须是叶子
brand_id            uuid,                -- 白牌为 null
model_no            text,                -- 型号 / 款号，人看的
identity_kind       text NOT NULL,       -- model_no | article_no | param_hash | none
match_key           text,                -- 'APPLE:A3294' / 'UNIQLO:466123' / 参数哈希
standard_spu_id     uuid,                -- 指向 type=standard 的行；白牌非标为 null
standard_matched_by text,                -- model_no | article_no | param_hash | manual
title               text NOT NULL,
subtitle            text,                -- 卖点，≤ 200 字；搜索也匹配它
seven_day_return    boolean NOT NULL DEFAULT true,  -- 七天无理由，随订单行快照
sold_count          bigint NOT NULL DEFAULT 0,      -- 已完成订单累加；退款不回冲
created_at          timestamptz NOT NULL DEFAULT now(),
updated_at          timestamptz NOT NULL DEFAULT now()
CONSTRAINT ck_spu_identity CHECK (identity_kind IN ('model_no','article_no','param_hash','none')),
CONSTRAINT ck_spu_matched  CHECK (standard_matched_by IS NULL OR standard_matched_by IN ('model_no','article_no','param_hash','manual')),
CONSTRAINT ck_spu_match_key CHECK ((identity_kind = 'none') = (match_key IS NULL))
```

> **没有 `status` 列，也没有 `images` 列。** 可售状态看 `listing.status`（原来那个 `spu.status`
> 只在发布通过时写成 `'active'`，没人读、下架也不改回，是又一个 `is_leaf`）；
> 图住 `spu_media`（`spu.images` 那个 jsonb 数组表达不了「选红色就换图」）。

**`identity_kind` 里没有 `gtin`。** GTIN 是 SKU 粒度的东西，挂在 SPU 上就是把键放错了层级。品牌标品挂标准品的路径是**型号**：商家 SPU 填 `model_no = A3294`，平台标准品的 `match_key` 也是 `APPLE:A3294`，两边对上才建立 `standard_spu_id`。GTIN 只在 SKU 上，用来比价分组。

**`spu` 上没有 `shop_id`。** SPU 是商家级的商品主数据，一个商家一个商品池；店铺归属在 `listing` 上。同一个 SPU 可以在同一个商家的两家店各挂一条 `listing`，这不叫两个商品。

索引：`idx_spu_merchant`、`idx_spu_category`、`idx_spu_standard`，以及：

```sql
CREATE UNIQUE INDEX uq_spu_standard_match
    ON catalog.spu (category_id, identity_kind, match_key)
    WHERE spu_type = 'standard';
```

**这个偏索引是标准品的防重护栏**：同一类目下一个识别键只能有一个标准品。商家 SPU 不能加这个约束——同一个 GTIN 全平台几百个商家都有，加了就没人能发布。

**为什么带 `category_id`。** `param_hash` 的键只由属性 code + 值拼成（白牌货没有品牌前缀），
不同类目撞键是常事。全局唯一会让两个不相干的商品共用一个标准品，同款聚合与比价把它们的价格放在同一组。
跨类目的同键是合法的：一个键在哪个类目里，就在哪个类目里建标准品。

**`spu` 上没有 `status` 列。** 可售状态只有一个来源：`listing.status`。
原来那个列只在发布通过时被写成 `'active'`，全项目没有任何地方读它，下架时也不会改回去——
又是一个 `is_leaf`：能从别处推导出来的状态，只在一半路径上维护，就一定会漂。
买家详情本来就是靠 `EXISTS (... status = 'online')` 判的。

### spu_attr

```sql
spu_id       uuid NOT NULL,
attribute_id uuid NOT NULL,
value_index  smallint NOT NULL DEFAULT 0,   -- 多值属性用；单值为 0
value_text   text,
value_num    numeric,
value_bool   boolean,
PRIMARY KEY (spu_id, attribute_id, value_index)
```

`value_index` 是给 `attribute.is_multi` 用的：一个 SPU 的"适用季节"可以是"春秋、冬"两个值。没有这一列，`(spu_id, attribute_id)` 只能存一个值，`is_multi` 就是一句空话。

索引 `idx_spu_attr_value (attribute_id, value_text)`——这条索引就是"筛选"的落点。

### spu_media

```sql
id           uuid PRIMARY KEY DEFAULT uuidv7(),
spu_id       uuid NOT NULL,
attribute_id uuid,              -- null = 通用主图
spec_value   text,              -- '红色'
url          text NOT NULL,
media_type   text NOT NULL,     -- image | detail | video
sort         integer NOT NULL DEFAULT 0
```

索引 `idx_spu_media (spu_id, attribute_id, spec_value)`。

**图挂规格值，不挂 SKU。** 一条连衣裙 8 色 × 5 码 = 40 个 SKU，但图只有 8 套。挂 SKU 上是 40 份重复，改一张图要改 5 行。

前端逻辑：选中"红"就取 `attribute_id = 颜色 AND spec_value = 红` 的那批；没选就取 `attribute_id IS NULL` 的通用图。

### sku

```sql
id             uuid PRIMARY KEY DEFAULT uuidv7(),
spu_id         uuid NOT NULL,
spec_values    jsonb NOT NULL,    -- [{"attributeId":"…","value":"红色"}, …]
spec_key       text NOT NULL,     -- 规格值排序后拼的串，只为加唯一索引
barcode        text,
identity_key   text,              -- GTIN 或参数哈希；比价按它聚合
price_amount   bigint NOT NULL,   -- 分
price_currency char(3) NOT NULL DEFAULT 'CNY',
original_price_amount bigint,     -- 划线价；NULL = 没有，CHECK >= price_amount
merchant_id    uuid,              -- 商家货号唯一域
merchant_code  text,              -- 商家自己的货号，同商家内唯一
weight_g       integer,
status         text NOT NULL      -- active | disabled
```

约束：`uq_sku_spec (spu_id, spec_key)`、`CHECK (price_amount >= 0)`、
`CHECK (price_currency = 'CNY')`、`CHECK (original_price_amount IS NULL OR original_price_amount >= price_amount)`、
偏唯一索引 `uq_sku_merchant_code (merchant_id, merchant_code) WHERE merchant_code IS NOT NULL`。

索引 `idx_sku_identity (identity_key)`——比价按它聚合。**不加唯一约束**：同一个 GTIN 全平台几百个商家都有，唯一了就没人能发布。

**`spec_key` 是唯一性的唯一来源。** 服务端按 `attribute_id` 排序拼出来，客户端的顺序不作数——否则"红/L"和"L/红"会被当成两个 SKU。单规格商品允许 `specs = {}`，此时 `spec_key = ''`；类目可以没有 `is_sales_spec` 属性。

**规格组合不存在，就是表里没这行。** 不存"禁用组合"表：红色只有 S/M，就只建两行，前端拿到全部 SKU 自己把 L 灰掉，并区分"不存在"和"存在但没库存"。

### listing

```sql
id            uuid PRIMARY KEY DEFAULT uuidv7(),
spu_id        uuid NOT NULL,
merchant_id   uuid NOT NULL,     -- 分片键
shop_id       uuid NOT NULL,
status        text NOT NULL,     -- draft | pending | approved | rejected | online | offline
reject_reason text,
submitted_at  timestamptz,
approved_at   timestamptz,
approved_by   uuid
```

约束：`uq_listing_spu_shop (spu_id, shop_id)`。

**`listing` 不带价格。** 价格在 SKU 上——一个 SPU 下不同规格价格不同，`listing` 只能记"这个商家上架了这个商品"这一件事。名字里的 listing 是"挂售"的意思，不是"报价"。

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

**驳回后重提是改原 `listing`，不是新建一条。** 否则反复驳回会让同一个商品长出一堆记录，唯一约束也保不住。审核过程记在这里，一轮一行，历史不删。

### front_category / front_category_map

```sql
front_category:
    id, parent_id, path, level, code, name, sort, status

front_category_map:
    front_category_id uuid,
    category_id       uuid,       -- 指向后台类目
    sort              integer,
    PRIMARY KEY (front_category_id, category_id)
```

后台类目管规则，前台类目管展示。初始数据 1:1 脚本生成，不要求运营一开始就拆。

### category_migration / category_migration_item

```sql
category_migration:
    id                 uuid PRIMARY KEY DEFAULT uuidv7(),
    migration_group_id uuid NOT NULL,   -- split 时串起多行
    kind               text NOT NULL,   -- merge | split | close
    from_category_id   uuid NOT NULL,
    to_category_id     uuid,            -- close 时为 null；split 时每行一个目标
    status             text NOT NULL,   -- planned | running | done | failed | rolled_back
    affected_spu       integer,
    affected_offer     integer,
    created_by         uuid,
    created_at         timestamptz NOT NULL DEFAULT now()
```

**只有汇总数回滚不了。** 所以每次迁移都要落明细，一条记录对应一个被搬走的实体：

```sql
category_migration_item:
    migration_id      uuid NOT NULL,
    entity_type       text NOT NULL,   -- spu | listing | standard_spu | category_grant
    entity_id         uuid NOT NULL,
    from_category_id  uuid NOT NULL,
    to_category_id    uuid NOT NULL,
    PRIMARY KEY (migration_id, entity_type, entity_id)
```

A 拆成 A1 / A2 时，一个 `from` 对两个 `to`，所以 `to_category_id` 在 item 上而不是只挂在汇总行。出事后按 item 反着搬回去，才是真的可回滚。

`status` 必须有 `failed` 这一档——迁到一半卡住是常态，没有这个状态就只能谎报成功。

### 状态机

```
draft ──提交──→ pending ──通过──→ approved ──上架──→ online
                  │                                   │
                  └──驳回──→ rejected ──改完重提──→ pending
                                                      │
                       offline ←── 商家主动下架 / 平台强制下架 ┘
                          │
                          └──重新提交──→ pending
```

三处只有平台能动：`pending → approved`、`pending → rejected`、`approved → online`。免审类目（`auto_approve = true`）由系统代劳。

**`offline` 不能直接回 `online`。** 商家主动下架后重新上架要回 `pending` 重新审；平台强制下架的还要先消违规。否则下架就成了绕过审核的开关。

## 4. 关键时序

### 正常流：商家发一个商品

```
商家             catalog                          search / governance
 │
 ├─ 建 SPU（draft）→ 选叶子类目 → 填属性值
 ├─ 建 SKU × N（规格组合 + 价格）
 ├─ 提交 ─────────→ 建 listing(status=pending)
 │                     │
 │                     ├─ governance 校验：这家店有没有该类目授权、该品牌的授权
 │                     ├─ 校验：父类目必填属性齐、品牌已批、SKU 至少一条
 │                     └─ auto_approve?
 │                          ├─ 是 → approved → online
 │                          └─ 否 → 等平台审
 │
 │  ← 驳回（reason，listing_review 记一轮）
 │  → 改 SPU/SKU → 重提（同一条 listing 回 pending，round+1）
 │
 ├─ 通过 ────────────────────────→ online
 │                                    └─ 发 ListingPublished →─→ search 建索引
```

`ListingPublished` 带 `listingId / merchantId / spuId / skuIds[] / categoryId / minPrice`。一个 SPU 一条事件，`search` 自己展开成 SKU 文档——按 SKU 发会重复 90% 的字段，而且一个 40 规格的连衣裙要发 40 条。

### 异常流一：平台强制下架

```
governance → listing.status = offline（平台动作）
      → 发 ListingOffline(reason)
      → search 删索引
      → 在途订单不动（订单里是快照）
```

已成交订单不因为商品下架而中断，履约照走，售后照受理。

### 异常流二：类目迁移

商品从 A 类目挪到 B 类目，不能直接 `UPDATE category_id`。要走一次下架重审：

```
offline → 改 category_id / 按 B 类目模板补属性 → pending → approved → online
```

三件事同时变了：属性模板（老属性值可能非法）、类目授权（要问 `governance`）、搜索索引（类目是索引字段）。直接改会让搜索里挂着字段对不上的文档。

牵连面：属性模板、标准品归属、佣金规则（新订单按 B，历史订单按快照）、搜索索引、商家类目授权、类目资质。**历史订单快照不动。**

### 异常流三：类目合并

```
category_migration(kind=merge, from=A, to=B, status=planned)
  → 影响面预览：A 下有多少 SPU / listing / 标准品 / 商家授权
  → status=running，分批迁移
  → A 置 status=closed，存量 listing 逐批移到 B 下重新起审
  → 失败可以按 migration 记录回滚
```

合并期间 A 下商品标记"类目调整中"，可临时下架。

### 异常流四：商家改价

```
商家改 sku.price_amount
  → 不影响已成交订单（订单里是快照）
  → 影响购物车（购物车不锁价，结算时按新价算）
  → 影响搜索展示（价格变了要重建索引）
```

## 5. 失败模式与未决

### 会错在哪

| 现象                                 | 根因                       | 怎么防                                                        |
| ------------------------------------ | -------------------------- | ------------------------------------------------------------- |
| 同一 SPU 下两个 SKU 规格撞车         | 唯一性靠代码查重，并发漏了 | `uq_sku_spec` 兜底                                            |
| "红/L" 和 "L/红" 建成两条            | 客户端拼 `spec_key`        | 服务端排序后拼                                                |
| 类目树成环                           | 移动节点没校验             | 新 parent 的 `path` 含自己就拒                                |
| 白牌标品归并全错（1米 / 1m / 100cm） | 属性值域没规范             | 类目必须用枚举值域，不给自由文本                              |
| 标准品挂错，比价全乱                 | 自动匹配没有置信度         | 只做型号/款号/参数哈希精确匹配 + 人工确认；GTIN 只做 SKU 比价 |
| 商家填错 GTIN，比价挂到别的商品上    | 商家自填，没有校验         | 格式校验 + 抽检，错配走申诉                                   |
| 同一参数两种写法，归并不了           | 识别属性允许自由文本       | `param_hash` 类目强制 enum / number                           |
| 拿 128G 的价当 256G 的价比           | 比价挂错了层级             | 按 `sku.identity_key` 聚合，不按 SPU                          |
| 子类目放宽了父类目的必填             | 合并逻辑取"最近定义"       | 三个布尔取祖先链 OR                                           |
| 商品下架了但搜索还搜得到             | 事件发了 `search` 没消费   | outbox 重试 + 索引侧校验 `listing.status`                     |
| 类目合并漏迁商家授权                 | 迁移只迁商品不迁授权       | 迁移清单校验 + `category_migration` 留痕                      |
| 停用类目下的商品还在卖               | `status` 只拦新建不拦下单  | 可售点查 / 买家列表 / 详情 / 比价都 JOIN `category.status`    |
| `code` 被改，外部系统对接断          | 图省事直接 UPDATE          | `code` 不可变，只允许新增                                     |
| 属性模板改了，老商品属性对不上       | 模板删属性                 | 属性只增不删，下线走 `status`                                 |

### 还没想清

- **商家自填 GTIN 的可信度。** 条码格式能校验，但填个假号识别不了。要不要抽检、抽检不合格怎么处置，没定。
- **值域谁来首建。** 一个新类目上线，运营得先想清楚"长度"有哪几档才敢开比价，这个成本可能比想象中高。
- **参数哈希要不要人工抽检。** 型号/款号精确匹配可以全自动；GTIN 需要格式校验 + 抽检，参数哈希错了没人发现，抽多少比例没定。

五条老问题已经定了：识别键下沉到 SKU、规范化做在写入侧、图挂规格值、前台类目先只建表、品牌授权归 `governance`。

## 实现契约

- **表**：14 张，见 §3；已落 10 张
- **库约束**：`uq_category_path`、`uq_category_code`、`ck_category_level (1..3)`、`ck_category_path_shape`（path 含自己且段数 = level）、`ck_category_identity_keys`（`gtin` 不许进 SPU 级）、`ck_attribute_identity_type`（识别属性必须 enum/number）、`uq_attribute_value (attribute_id, lower(value))`、`uq_attribute_code (category_id, code)`、`uq_sku_spec (spu_id, spec_key)`、`uq_listing_spu_shop`、`uq_spu_attr (spu_id, attribute_id, value_index)`、`ck_spu_attr_one_value`（三个值列恰好一个非空）、`uq_spu_standard_match (category_id, identity_kind, match_key)`（partial，仅 `spu_type='standard'`）、`uq_brand_name (lower(name))`、`ck_sku_currency (price_currency='CNY')`、`ck_sku_original_price`、`uq_sku_merchant_code (merchant_id, merchant_code)`（partial）、`trg_listing_merchant_matches_spu`（listing 归属必须与 SPU 一致）
- **触发器护栏**：`catalog.require_leaf_config()`（只有 level=3 能插 `category_config`）、`catalog.require_leaf_attribute()`（只有 level=3 能有属性模板）、`governance.assert_leaf_category()`（授权/资质只能挂叶子，否则会被静默作废）、`common.touch_updated_at()`（维护 `updated_at`，UPDATE 语句里不要自己写）
- **识别键**：由 `IdentityKeyResolver` 统一算，mapper 不自己拼。SPU 级 `match_key` = `品牌:型号` / `品牌:款号` / `参数哈希`；SKU 级 `identity_key` = GTIN 或规格参数哈希。**归一化但不换算单位**：`1`/`1.0` 同一个键，`1m`/`100cm` 两个键，单位进键（`1|m` ≠ `1|W`）。只有类目**只认 GTIN**（`sku_identity_kinds` 含 `gtin` 且不含 `param_hash`）时条码必填；同时声明两者时白牌货可走参数哈希
- **识别键优先级**：`match_strategies` 是试用顺序，`identity_keys` 是允许范围；策略为空时退回 `identity_keys` 声明顺序。白牌标品要把 `param_hash` 排前面，否则型号各编各的、归并出一堆单例
- **参数哈希**：所有 `is_identity` 属性都必须有值才拼键；缺一项返回不可识别，不生成短哈希。多值属性的值排序后拼接。类目配置在创建 / 改配置 / 加属性三处都强制识别属性必填
- **标准品匹配**：`StandardMatcher` 在 SPU 落库后挂 `standard_spu_id` / `standard_matched_by`。只做精确匹配（型号 / 款号 / 参数哈希全等），不做模糊——模糊没有置信度，错配一次比价全乱。标准品**懒建**：`INSERT ... ON CONFLICT DO NOTHING RETURNING id`，拿不到 id 再 SELECT。冲突键是 `(category_id, identity_kind, match_key)`——`param_hash` 不含类目，跨类目撞键不能共用。**不能写成"先查再插 + catch `DuplicateKeyException`"**：PostgreSQL 里那个异常会终止整个事务，后面的语句全部 `current transaction is aborted`，而 `ON CONFLICT` 走推测插入、会等并发那一笔。类目关了不影响已有挂载——标准品是平台主数据，买家还要能看它的评论和比价；拦下单的是 `listing.status`
- **属性值落库**：`spu_attr` 三个值列按 `attribute.value_type` 分派——`number` 进 `value_num`、`bool` 进 `value_bool`、其余进 `value_text`。多值属性按 `value_index` 递增写，只写 0 会让 `is_multi` 变成空话。- **审核轮次**：`listing_review.round` 由 `ListingMapper.nextRound()` 按已审次数 +1 算，不硬编码。驳回后重提走同一条 listing（`uq_listing_spu_shop` 会挡住新建），所以 `REJECTED → PENDING` 那条状态机和 `uq_listing_review_round` 才真正生效
- **事件**：发 `SellerOfferSubmitted` / `ListingPublished` / `ListingOffline`
- **错误码**：`CATEGORY_NOT_LEAF`、`CATEGORY_DISABLED`、`CATEGORY_CONFIG_INCOMPLETE`、`CATEGORY_LEVEL_EXCEEDED`、`CATEGORY_CODE_TAKEN`、`ATTRIBUTE_CODE_TAKEN`、`IDENTITY_ATTRIBUTE_NEEDS_DOMAIN`、`BRAND_REQUIRED`、`BRAND_FORBIDDEN`、`DUPLICATE_SKU_SPEC`；governance 侧 `CREDENTIAL_MISSING`
- **验收**：同一 SPU 插重复规格被唯一键拒；两个标准品抢同一 `match_key` 被偏索引拒；给 L1/L2 插配置行被触发器拒；第四层类目建不出来；识别属性用 text 被拒；SKU 规格值不在值域被拒；往 L1 授权被触发器拒；数字属性的值落进 `value_num`；驳回后重提不新建 listing 且 round +1；`1m` 与 `1.0m` 算出同一个 `match_key` 而 `2m` 不同；属性传参顺序不影响哈希；`match_strategies` 把 `param_hash` 排前面时，填了型号的商品仍按参数哈希归并；两个商家并发发同款，标准品只有一条、两个请求都成功
