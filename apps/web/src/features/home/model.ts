import { z } from "zod"

/**
 * features/home 领域层 —— wire DTO + 业务形状 + 商品卡片映射。
 *
 * - 本文件（model.ts）：后端响应 schema + 业务形状
 * - actions.ts：读写命令（纯逻辑，用 api.raw 请求）
 * 对外（index.ts 或直接 import）只暴露业务类型，传输 DTO 不出门。
 */

// ---------- CMS：首页导航 ----------

/** 导航子分组 {name, items[]}，与后端 NavGroup 同构 */
export const NavGroupSchema = z.object({
    name: z.string(),
    items: z.array(z.string()),
})
export type NavGroup = z.infer<typeof NavGroupSchema>

/** 后端 NavEntry wire 形状 */
const NavEntryDtoSchema = z.object({
    id: z.string(),
    navKey: z.string(),
    title: z.string(),
    iconKey: z.string().nullable(),
    target: z.string().nullable(),
    targetType: z.string().nullable(),
    subs: z.array(NavGroupSchema).nullable(),
    sortOrder: z.number(),
    status: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export const NavEntrySchema = NavEntryDtoSchema.transform((dto) => ({
    id: dto.id,
    title: dto.title,
    iconKey: dto.iconKey ?? "",
    target: dto.target ?? "",
    targetType: dto.targetType ?? "",
    subs: dto.subs ?? [],
}))
export type NavEntry = z.infer<typeof NavEntrySchema>

// ---------- CMS：运营位 banner ----------

/** 后端 Banner wire 形状 */
const BannerDtoSchema = z.object({
    id: z.string(),
    slot: z.string(),
    title: z.string(),
    subtitle: z.string().nullable(),
    imageUrl: z.string(),
    target: z.string().nullable(),
    targetType: z.string().nullable(),
    link: z.string().nullable(),
    sortOrder: z.number(),
    status: z.number(),
    startAt: z.string().nullable(),
    endAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export const BannerSchema = BannerDtoSchema.transform((dto) => ({
    id: dto.id,
    title: dto.title,
    subtitle: dto.subtitle ?? "",
    image: dto.imageUrl,
    target: dto.target ?? "",
    targetType: dto.targetType ?? "",
    link: dto.link ?? "",
}))
export type Banner = z.infer<typeof BannerSchema>

// ---------- CMS：推荐条词条 ----------

/** 后端 RecommendTab wire 形状 */
const RecommendTabDtoSchema = z.object({
    id: z.string(),
    name: z.string(),
    target: z.string().nullable(),
    targetType: z.string().nullable(),
    isDefault: z.boolean().nullable(),
    sortOrder: z.number(),
    status: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
})
export const RecommendTabSchema = RecommendTabDtoSchema.transform((dto) => ({
    id: dto.id,
    name: dto.name,
    target: dto.target ?? "",
    targetType: dto.targetType ?? "",
    isDefault: dto.isDefault ?? false,
}))
export type RecommendTab = z.infer<typeof RecommendTabSchema>

// ---------- 买家商品列表（/api/products 的 ProductResponse） ----------

const BuyerProductDtoSchema = z.object({
    id: z.string(),
    shopId: z.string(),
    categoryId: z.string(),
    name: z.string(),
    subtitle: z.string().nullable(),
    mainImage: z.string().nullable(),
    minPrice: z.number().nullable(),
    maxPrice: z.number().nullable(),
})
export const BuyerProductSchema = BuyerProductDtoSchema.transform((dto) => ({
    id: dto.id,
    title: dto.name,
    subtitle: dto.subtitle ?? "",
    image: dto.mainImage ?? "",
    price: dto.minPrice ?? 0,
}))
export type BuyerProduct = z.infer<typeof BuyerProductSchema>
