import { z } from "zod"

// ---------- 商品（卖家侧 /seller/products，店铺上下文走 X-Shop-Id） ----------

/** 商品状态：1 上架 / 0 下架 / 2 草稿（与后端 Product.STATUS_* 对齐） */
export const ProductStatusSchema = z.union([z.literal(1), z.literal(0), z.literal(2)])
export type ProductStatus = z.infer<typeof ProductStatusSchema>

/** {name, value} 条目：SPU 非销售参数与 SKU 规格取值共用 */
export const ParamItemSchema = z.object({
    name: z.string().min(1).max(32),
    value: z.string().min(1).max(64),
})
export type ParamItem = z.infer<typeof ParamItemSchema>

/** 销售属性维度 {name, values}，SKU 按各维取值笛卡尔积生成 */
export const SpecItemSchema = z.object({
    name: z.string().min(1).max(32),
    values: z.array(z.string().max(64)).min(1),
})
export type SpecItem = z.infer<typeof SpecItemSchema>

export const SkuSchema = z.object({
    id: z.uuid(),
    productId: z.uuid(),
    skuCode: z.string().nullable(),
    name: z.string(),
    attributes: z.array(ParamItemSchema).nullable(),
    image: z.string().nullable(),
    /** 成交价（分） */
    price: z.number().nullable(),
    /** 划线价（分） */
    originalPrice: z.number().nullable(),
    currency: z.string().nullable(),
    stock: z.number().nullable(),
    /** 1 在售 / 0 停用 */
    status: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export type Sku = z.infer<typeof SkuSchema>

export const ProductSchema = z.object({
    id: z.uuid(),
    shopId: z.uuid(),
    categoryId: z.uuid(),
    name: z.string(),
    subtitle: z.string().nullable(),
    description: z.string().nullable(),
    mainImage: z.string().nullable(),
    images: z.array(z.string()).nullable(),
    specs: z.array(SpecItemSchema).nullable(),
    params: z.array(ParamItemSchema).nullable(),
    /** 价格区间（分），SKU 聚合冗余 */
    minPrice: z.number().nullable(),
    maxPrice: z.number().nullable(),
    status: ProductStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
})
export type Product = z.infer<typeof ProductSchema>

export const ProductDetailSchema = z.object({
    product: ProductSchema,
    skus: z.array(SkuSchema),
})
export type ProductDetail = z.infer<typeof ProductDetailSchema>

/** 分页返回包装 */
export const PageResultSchema = <T>(item: z.ZodType<T>) =>
    z.object({ records: z.array(item), total: z.number() })

// ---------- 类目（公开 /api/categories/tree） ----------

export const CategoryNodeSchema: z.ZodType<CategoryNode> = z.lazy(() =>
    z.object({
        id: z.uuid(),
        parentId: z.uuid().nullable(),
        name: z.string(),
        level: z.number(),
        sort: z.number().nullable(),
        status: z.number(),
        iconUrl: z.string().nullable(),
        children: z.array(CategoryNodeSchema).nullable(),
    }),
)
export interface CategoryNode {
    id: string
    parentId: string | null
    name: string
    level: number
    sort: number | null
    status: number
    iconUrl: string | null
    children: CategoryNode[] | null
}

// ---------- 请求 ----------

/** 商品标题（搜索标题）：参与搜索召回的关键词位，上限 30 字 */
export const ProductNameSchema = z
    .string()
    .trim()
    .min(1, "请输入商品标题")
    .max(30, "商品标题最长 30 字")

/** 一句话卖点：可不填；填了就得写够一句（10~30 字），与后端 @Pattern 校验对齐 */
export const SellingPointSchema = z
    .string()
    .trim()
    .refine(
        (v) => v.length === 0 || (v.length >= 10 && v.length <= 30),
        "卖点填了就写 10~30 字，不想写可以留空",
    )

export const CreateProductRequestSchema = z.object({
    categoryId: z.uuid("请选择商品分类"),
    name: ProductNameSchema,
    subtitle: SellingPointSchema.optional(),
    description: z.string().optional(),
    mainImage: z.string().max(255).optional(),
    images: z.array(z.string().max(255)).optional(),
    params: z.array(ParamItemSchema).optional(),
})
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>

export type UpdateProductRequest = CreateProductRequest

export const SkuUpdateItemSchema = z.object({
    skuId: z.uuid(),
    name: z.string().max(160).optional(),
    image: z.string().max(255).optional(),
    price: z.number().min(0),
    originalPrice: z.number().min(0).optional().nullable(),
    stock: z.number().int().min(0),
    skuCode: z.string().max(64).optional(),
    status: z.union([z.literal(0), z.literal(1)]).optional(),
})
export type SkuUpdateItem = z.infer<typeof SkuUpdateItemSchema>
