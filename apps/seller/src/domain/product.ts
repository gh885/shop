import type { ParamItem, ProductResponse, SkuAttr, SkuResponse, SpecItem } from "@shop/api/sdk"

/**
 * product —— 卖家端商品领域层（纯类型 + wire → 投影，不碰 React / 网络）。
 *
 * 与买家端 web 的分工：买家端只读上架商品的精简字段（PublicProductResponse）；
 * 卖家端按 X-Shop-Id 操作自己店的全状态商品（ProductResponse），多出 skuCode/status/updatedAt 等。
 * wire 字段全可选（openapi-ts 默认），投影归一为稳定的非空/字面量领域形状，前端不再依赖 SDK 的可选性。
 */

// ---------- 状态（字面量联合，与后端枚举 name() 对齐） ----------

/** 商品状态：PUBLISHED 上架 / OFF 下架 / DRAFT 草稿 */
export type ProductStatus = "PUBLISHED" | "OFF" | "DRAFT"

/** SKU 在售状态：ON_SALE 在售 / DISABLED 停用 */
export type ActiveStatus = "ON_SALE" | "DISABLED"

// ---------- 域类型（非空） ----------

/** 商品列表项 / 详情主体：字段与后端卖家端 ProductResponse 对齐，非空字段为领域保证 */
export type Product = {
    id: string
    shopId: string
    categoryId: string
    name: string
    subtitle: string | null
    mainImage: string | null
    images: string[]
    specs: SpecItem[]
    params: ParamItem[]
    /** 价格区间（分），草稿期可为 null */
    minPrice: number | null
    maxPrice: number | null
    status: ProductStatus
    createdAt: string
    updatedAt: string
}

/** SKU 业务形状：attributes 空数组兜底；price/originalPrice/stock 允许 null（草稿未填） */
export type Sku = {
    id: string
    productId: string
    skuCode: string | null
    name: string
    attributes: SkuAttr[]
    image: string | null
    price: number | null
    originalPrice: number | null
    currency: string | null
    stock: number | null
    status: ActiveStatus
}

// ---------- wire → 投影 ----------

function toStatus(s: ProductStatus | undefined): ProductStatus {
    return s === "PUBLISHED" || s === "OFF" ? s : "DRAFT"
}

function toActiveStatus(s: ActiveStatus | undefined): ActiveStatus {
    return s === "DISABLED" ? "DISABLED" : "ON_SALE"
}

/** wire → 商品：可选字段归一为稳定缺省，status 归一字面量（非法值按草稿处理） */
export function toProduct(dto: ProductResponse): Product {
    return {
        id: dto.id ?? "",
        shopId: dto.shopId ?? "",
        categoryId: dto.categoryId ?? "",
        name: dto.name ?? "",
        subtitle: dto.subtitle ?? null,
        mainImage: dto.mainImage ?? null,
        images: dto.images ?? [],
        specs: dto.specs ?? [],
        params: dto.params ?? [],
        minPrice: dto.minPrice ?? null,
        maxPrice: dto.maxPrice ?? null,
        status: toStatus(dto.status),
        createdAt: dto.createdAt ?? "",
        updatedAt: dto.updatedAt ?? "",
    }
}

/** wire → SKU：attributes 归一为空数组，价格/库存缺失按 null（草稿）处理 */
export function toSku(dto: SkuResponse): Sku {
    return {
        id: dto.id ?? "",
        productId: dto.productId ?? "",
        skuCode: dto.skuCode ?? null,
        name: dto.name ?? "",
        attributes: dto.attributes ?? [],
        image: dto.image ?? null,
        price: dto.price ?? null,
        originalPrice: dto.originalPrice ?? null,
        currency: dto.currency ?? null,
        stock: dto.stock ?? null,
        status: toActiveStatus(dto.status),
    }
}

/** 详情 wire → 领域形状：SKU 逐条投影 */
export function toProductDetail(dto: { product?: ProductResponse; skus?: SkuResponse[] }): {
    product: Product
    skus: Sku[]
} {
    return {
        product: toProduct(dto.product ?? ({} as ProductResponse)),
        skus: (dto.skus ?? []).map(toSku),
    }
}
