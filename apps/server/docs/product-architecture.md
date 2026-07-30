# Product 模块 — 架构说明

## 全库 ID 策略（所有模块通用）

**主键统一使用 uuidv7，类型 `UUID`。**

- 列定义：`id UUID PRIMARY KEY DEFAULT uuidv7()`（PG 18 原生函数，无需扩展）
- Java 侧：`java.util.UUID`，MyBatis-Plus `@TableId(type = IdType.INPUT)`
- 实际生成走应用层：`MyBatisPlusMetaObjectHandler` 在 insert 时用 `UuidCreator.getTimeOrderedEpoch()` 填充（字段已有值则不覆盖）；DB default 只是兜底
- 配套基础设施（`infra/`）：`MyBatisConfig` + `UuidTypeHandler` —— MyBatis 无内置 UUID TypeHandler，不注册会导致 uuid 列映射为 null、`selectById(UUID)` 报 no getter；`MyBatisConfig` 已全局注册，新实体直接用 `UUID` 即可
- 禁止再引入其他主键方案（自增 / 雪花 / uuidv4），关联表、日志表同样遵守

选型理由：

1. **可枚举问题消失**：ID 可安全暴露在任何接口 / URL / 日志 / 消息队列中，无需逐接口评估暴露面，也不需要双 ID（内部自增 + 外部随机）方案
2. **生成无协调**：多副本部署、未来拆服务均无需改动（对比雪花的 workerId 分配问题）
3. **时间有序**：索引局部性接近自增，写入性能无 uuidv4 的碎片化问题
4. 代价：16B（vs BIGINT 8B），正常业务规模下无感

配套规则：**给用户看的业务编号（订单号、售后单号、支付流水号）是独立业务字段**（日期段 + 随机段），不是主键，不要用主键充当编号。

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

## 模块结构（遵循 AGENTS.md 约定）

```
product/
├── ProductModuleConfig.java   ← @ConditionalOnProperty(shop.product.enabled)
├── package-info.java          ← @ApplicationModule
├── controller/                ← 后续：分类树查询、管理端 CRUD
├── service/                   ← 后续：层级校验、移动、禁用级联
└── mapper/                    ← Category 实体 + CategoryMapper
```
