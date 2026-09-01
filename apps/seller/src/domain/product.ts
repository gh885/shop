import type { ParamItem, ProductResponse, SkuAttr, SkuResponse, SpecItem } from "@shop/api/sdk"

/**
 * product —— 卖家端商品领域层（纯类型 + wire → 投影，不碰 React / 网络）。
 *
 * 与买家端 web 的分工：买家端只读上架商品的精简字段（PublicProductResponse）；
 * 卖家端按 X-Shop-Id 操作自己店的全状态商品（ProductResponse），多出 skuCode/status/updatedAt 等。
 * wire 字段全可选（openapi-ts 默认），投影归一为稳定的非空/字面量领域形状，前端不再依赖 SDK 的可选性。
 */

// ---------- 状态（字面量联合，与后端 Product.STATUS_* 对齐） ----------

/** 商品状态：1 上架 / 0 下架 / 2 草稿 */
export type ProductStatus = 1 | 0 | 2

/** SKU / 通用状态：1 在售 / 0 停用 */
export type ActiveStatus = 1 | 0

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

function toStatus(s: number): ProductStatus {
    return s === 1 || s === 0 ? s : 2
}

function toActiveStatus(s: number): ActiveStatus {
    return s === 0 ? 0 : 1
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
        status: toStatus(dto.status ?? 2),
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
        status: toActiveStatus(dto.status ?? 1),
    }
}

/** 详情 wire → 领域形状：SKU 逐条投影 */
export function toProductDetail(dto: { product?: ProductResponse; skus?: SkuResponse[] }): {
    product: Product
    skus: Sku[]
} {
    return {
        product: toProduct(dto.product ?? {}),
        skus: (dto.skus ?? []).map(toSku),
    }
}
