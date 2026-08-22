import { z } from "zod"

import { MoneySchema, ParamItemSchema, SpecItemSchema } from "@shop/api"

/**
 * entities/product 凝聚模块 —— 买家侧商品领域对象 + 数据层。
 *
 * - 本文件（model.ts）：DTO（私有）+ 业务形状，对齐后端买家侧 ProductController 出参
 *   （/api/products 列表项、/api/products/{id} 详情；卖家侧 /seller/products 走 @shop/api 的 createProductApi，互不相干）
 * - actions.ts：读命令（纯逻辑，匿名可访问，SSR / 组件 / 测试任意调用）
 * 对外（index.ts）只暴露业务形状，传输 DTO 不出门。金额一律 Money（分 + 币种），不裸传 number。
 */

// ---------- 传输层（私有，镜像买家侧 wire 形状） ----------

/** 列表项 wire：详情响应的 product 字段与之同构 */
const ProductDtoSchema = z.object({
    id: z.uuid(),
    shopId: z.uuid(),
    categoryId: z.uuid(),
    name: z.string(),
    subtitle: z.string().nullable(),
    mainImage: z.string().nullable(),
    /** 价格区间（SKU 聚合冗余），无 SKU 时为 null */
    minPrice: MoneySchema.nullable(),
    maxPrice: MoneySchema.nullable(),
})

/** SKU 买家视图 wire：后端已滤掉 skuCode/status（仓管内部编码与内部状态） */
const SkuDtoSchema = z.object({
    id: z.uuid(),
    name: z.string(),
    /** 规格取值，如 [{name: 颜色, value: 黑}] */
    attributes: z.array(ParamItemSchema).nullable(),
    image: z.string().nullable(),
    price: MoneySchema.nullable(),
    originalPrice: MoneySchema.nullable(),
    stock: z.number().int().nullable(),
})

// ---------- 业务层 ----------

/** 商品列表项：卡片/推荐流通用。null 归一成空串，价格区间保留 Money 由展示层决定拼不拼 */
export const ProductSchema = ProductDtoSchema.transform((dto) => ({
    id: dto.id,
    shopId: dto.shopId,
    categoryId: dto.categoryId,
    title: dto.name,
    subtitle: dto.subtitle ?? "",
    image: dto.mainImage ?? "",
    priceMin: dto.minPrice,
    priceMax: dto.maxPrice,
}))
export type Product = z.infer<typeof ProductSchema>

/** SKU 业务形状：attributes 空数组兜底；image 为 undefined 表示无专属图（回退主图）；stock 缺失按 0 售罄处理 */
export const SkuSchema = SkuDtoSchema.transform((dto) => ({
    id: dto.id,
    name: dto.name,
    attributes: dto.attributes ?? [],
    image: dto.image ?? undefined,
    price: dto.price,
    originalPrice: dto.originalPrice,
    stock: dto.stock ?? 0,
}))
export type Sku = z.infer<typeof SkuSchema>

/** 商品详情：内嵌已塑形的 product/sku schema，一次 parse 完成校验 + 子对象转换 */
const ProductDetailResponseSchema = z.object({
    product: ProductSchema,
    description: z.string().nullable(),
    images: z.array(z.string()).nullable(),
    specs: z.array(SpecItemSchema).nullable(),
    params: z.array(ParamItemSchema).nullable(),
    skus: z.array(SkuSchema),
})

/** 商品详情业务形状：图文/规格/参数 null 兜底空值，渲染层无需再判空 */
export const ProductDetailSchema = ProductDetailResponseSchema.transform((d) => ({
    product: d.product,
    description: d.description ?? "",
    images: d.images ?? [],
    specs: d.specs ?? [],
    params: d.params ?? [],
    skus: d.skus,
}))
export type ProductDetail = z.infer<typeof ProductDetailSchema>

// ---------- 列表查询入参 ----------

/** 排序方式（与后端 ProductQuery 的 @Pattern 对齐，非法值后端 400） */
export const ProductSortSchema = z.enum(["newest", "price_asc", "price_desc"])
export type ProductSort = z.infer<typeof ProductSortSchema>

/** 全站上架商品列表查询：字段全可选，page/size 有默认（分页上限 100 同后端 @Max） */
export const ProductListQuerySchema = z.object({
    page: z.number().int().min(1).default(1),
    size: z.number().int().min(1).max(100).default(20),
    categoryId: z.uuid().optional(),
    shopId: z.uuid().optional(),
    keyword: z.string().trim().min(1).max(128).optional(),
    sort: ProductSortSchema.optional(),
})
/** 入参形状（page/size 可省，走默认）与解析后形状分开导出 */
export type ProductListQueryInput = z.input<typeof ProductListQuerySchema>
export type ProductListQuery = z.output<typeof ProductListQuerySchema>
