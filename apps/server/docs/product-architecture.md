# Product 模块 — 架构说明

## 全库 ID 策略

主键统一 uuidv7、业务编号独立字段等**全库 ID 策略已上提至 [docs/architecture.md §5](../../docs/architecture.md#5-全库-id-策略所有模块通用)**——它不属于 product 模块，本文不再重复维护。

## 分类体系

电商分类分两层，**本项目第一阶段只做后台类目树**：

- **后台类目树（本模块）**：平台级唯一一棵树，固定最多三层。商品发布必须挂到叶子类目（level = 3），叶子类目后续承载属性/SKU 模板。核心作用是商品归属，不是导航。
- **前台运营导航（不做）**：首页频道、楼层、活动位是运营配置，入口背后映射类目 ID 集合或搜索关键词。点击跳搜索页（`/search?categoryId=N`）——分类浏览本质是带类目条件的搜索。各端展示形态不同（App 左右联动分类页 / Web hover 浮层），但消费同一个 `GET /api/categories/tree`。

## categories 表

```sql
product.categories (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    parent_id   UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    name        VARCHAR(64) NOT NULL,
    level       SMALLINT NOT NULL,          -- 1/2/3，service 层根据 parent 计算，不由前端传
    sort        INT NOT NULL DEFAULT 0,     -- 同级排序权重
    status      SMALLINT NOT NULL DEFAULT 1,-- 1 启用 / 0 禁用；不做物理删除
    icon_url    VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (parent_id, name)                -- 同级不重名
)
```

设计要点：

- `parent_id` 根节点用零 UUID 表示而非 NULL，避免查询写法分裂
- `level` 是冗余字段，换取"最多三层""商品只能挂叶子"的 O(1) 校验
- 不存 `path/ancestors` 冗余：深度固定为 3，两次 join 即可查完子树
- 类目被商品引用后只能禁用不能删除，保证历史数据完整

## 规格值 ID 化与类目属性模板（V29/V30 起）

叶子类目挂属性模板：`product.category_attrs`（属性定义，kind=1 销售属性 / kind=2 非销售参数）+ `product.category_attr_values`（枚举值域，source=1 平台预置 / 2 卖家扩充）。

核心变化：**SKU 身份从「attributes JSONB 整体值比较」改为「spec_key 列」**——valueId 按模板维度顺序 `:` join，唯一索引 `uk_skus_product_spec_key(product_id, spec_key)`，无规格商品为 `''`。

- `products.specs` 元素新形状：`{attrId, name, values:[{valueId, value}]}`；`skus.attributes` 元素新形状：`{attrId, valueId, name, value}`。attrId/valueId 是身份，name/value 是显示快照
- **规格值改名不丢价**：改名只是改 value 快照（`CategoryAttrService.updateValue` 同事务刷新引用 SKU 的 attributes/name 快照，按 `spec_key LIKE %valueId%` 圈定），spec_key 不动 → updateSpecs 对账按 spec_key 走时组合不变，价格库存保留。消除了旧版「改名即新组合、旧 SKU 删除丢价」的已知限制
- 卖家可扩充值域：`attr.allow_custom=true` 时 updateSpecs 受理 `customValues`，自动建档 source=2（同名复用，唯一索引兜底并发）；`allow_custom=false` 拒绝值域外值
- params 模板校验：类目存在启用 param 模板时，提交的 ParamItem 必须带模板内 attrId、required 必填、值域受控时值须在值域内；无模板维持自由文本
- 禁用语义同 categories：查询侧裁剪不写扩散，存量 SKU 快照自洽，新商品不可再选

已知限制（本阶段不做）：规格值删除/禁用（第一版只支持改名/排序）、模板继承（父类目模板不下沉）、products.specs 的显示快照只在下一次 updateSpecs 时随模板重写（SKU 快照是即时刷新的）、买家侧属性聚合筛选（依赖搜索索引）。

## 模块结构（遵循 AGENTS.md 约定）

```
product/
├── package-info.java          ← @ApplicationModule
├── controller/                ← 后续：分类树查询、管理端 CRUD
├── service/                   ← 后续：层级校验、移动、禁用级联
└── mapper/                    ← Category 实体 + CategoryMapper
```
