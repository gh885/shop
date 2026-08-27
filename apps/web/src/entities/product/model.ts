import { z } from "zod"

import { fenToYuan, MoneySchema, ParamItemSchema, SpecItemSchema, type SpecItem } from "@shop/api"

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

// ---------- 规格选择 ----------

/** 规格选择状态：维度名 → 已选值。未选的维度不出现在记录里（允许部分选择） */
export type SkuSelection = Record<string, string>

/** 按已选规格精确匹配 SKU：selection 里每个维度都命中该 SKU 的 attributes 才算 */
export function findMatchingSku(skus: Sku[], selection: SkuSelection): Sku | undefined {
    const entries = Object.entries(selection)
    if (entries.length === 0) return undefined
    return skus.find((sku) =>
        entries.every(([name, value]) =>
            sku.attributes.some((a) => a.name === name && a.value === value),
        ),
    )
}

/**
 * 某维度的某值在「当前已选其他维度」约束下是否可选：
 * 把该值代入后，存在 stock > 0 且其余已选维度也命中的 SKU 才可选（售罄组合置灰）。
 */
export function isValueAvailable(
    skus: Sku[],
    selection: SkuSelection,
    specName: string,
    value: string,
): boolean {
    const constrained: SkuSelection = { ...selection, [specName]: value }
    return skus.some(
        (sku) =>
            sku.stock > 0 &&
            Object.entries(constrained).every(([name, v]) =>
                sku.attributes.some((a) => a.name === name && a.value === v),
            ),
    )
}

/** 规格组的某个值对应的 SKU 专属图（取第一个命中），无则 undefined → 该组退化为文字丸 */
export function specValueImage(skus: Sku[], specName: string, value: string): string | undefined {
    return skus.find(
        (sku) =>
            sku.image !== undefined &&
            sku.attributes.some((a) => a.name === specName && a.value === value),
    )?.image
}

/** 规格组是否用图片卡渲染：任一值有 SKU 专属图即整组升级（对齐淘宝「分册名」图片卡） */
export function isImageSpecGroup(skus: Sku[], spec: SpecItem): boolean {
    return spec.values.some((v) => specValueImage(skus, spec.name, v) !== undefined)
}

// ---------- 价格 / 库存展示 ----------

// 金额格式化用 @shop/api 的 fenToYuan（与 Money 契约同源），不在本模块重复定义

export interface PriceView {
    /** 主价文案（元字符串）：选全规格 → SKU 价；未选全 → 价格区间下限 */
    primary: string
    /** 区间上限：与 primary 相同则不显示区间（undefined） */
    rangeTo?: string
    /** 划线价（元字符串）：仅选中 SKU 且有 originalPrice 时给 */
    original?: string
    /** 币种（当前只有 CNY，透传给展示层备用） */
    currency: string
}

/** 价格展示策略：优先选中 SKU 的价，未选全回退商品价格区间（priceMin/priceMax） */
export function derivePriceView(detail: ProductDetail, selection: SkuSelection): PriceView {
    const matched = findMatchingSku(detail.skus, selection)
    if (matched?.price) {
        return {
            primary: fenToYuan(matched.price.amount),
            original: matched.originalPrice ? fenToYuan(matched.originalPrice.amount) : undefined,
            currency: matched.price.currency,
        }
    }

    const { priceMin, priceMax } = detail.product
    const from = priceMin ?? priceMax
    if (!from) return { primary: "0.00", currency: "CNY" }
    return {
        primary: fenToYuan(from.amount),
        rangeTo:
            priceMax && priceMax.amount !== from.amount ? fenToYuan(priceMax.amount) : undefined,
        currency: from.currency,
    }
}

/** 库存文案：选中 SKU → 精确库存（0 显示售罄）；未选 → 任一 SKU 有货即「有货」 */
export function deriveStockText(detail: ProductDetail, selection: SkuSelection): string {
    const matched = findMatchingSku(detail.skus, selection)
    if (matched) return matched.stock > 0 ? `库存 ${matched.stock} 件` : "该规格已售罄"
    return detail.skus.some((s) => s.stock > 0) ? "有货" : "暂时缺货"
}

/** 全部规格维度都已选择（有规格组时才允许加购/购买） */
export function isSelectionComplete(detail: ProductDetail, selection: SkuSelection): boolean {
    if (detail.specs.length === 0) return true
    return detail.specs.every((spec) => selection[spec.name] !== undefined)
}
