import { compactCount, type Money, sameMoney, strikethroughPrice } from "@shop/common/domain"
import type { AppLocale } from "@shop/i18n"
import type { ParamItem, PublicSkuResponse, SpecItem } from "@shop/api/sdk"

export type Product = {
    id: string
    shopId: string
    categoryId: string
    title: string
    subtitle: string | null
    image: string | null
    priceMin: Money
    priceMax: Money
    soldCount: number
}

export type Sku = PublicSkuResponse

export type ProductDetail = {
    product: Product
    sevenDayReturn: boolean
    detailImages: string[]
    images: string[]
    specs: SpecItem[]
    params: ParamItem[]
    skus: Sku[]
}

/**
 * 排序方式（与后端 `ProductQuery.sort` 的 `@Pattern` 对齐，非法值后端 400）。
 *
 * 那格在契约里是 `@Pattern("newest|price_asc|price_desc")` 而不是 enum，前端拿不到结构化的词表
 * （TS 也切不开一个字面量类型），所以它与契约是否相等由 `product.test.ts` 断言。
 */
export const PRODUCT_SORT_VALUES = ["newest", "price_asc", "price_desc"] as const
export type ProductSort = (typeof PRODUCT_SORT_VALUES)[number]

export type ProductListQueryInput = {
    page?: number
    size?: number
    categoryId?: string
    shopId?: string
    keyword?: string
    sort?: ProductSort
}

/** 规格选择状态：维度名 → 已选值。未选的维度不出现在记录里（允许部分选择） */
export type SkuSelection = Record<string, string>

export function findMatchingSku(skus: Sku[], selection: SkuSelection): Sku | undefined {
    const entries = Object.entries(selection)
    if (entries.length === 0) return undefined
    return skus.find((sku) =>
        entries.every(([name, value]) =>
            sku.attributes.some((a) => a.name === name && a.value === value),
        ),
    )
}

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

export function specValueImage(skus: Sku[], specName: string, value: string): string | undefined {
    const sku = skus.find((s) => s.attributes.some((a) => a.name === specName && a.value === value))
    return sku?.image ?? undefined
}

export function isImageSpecGroup(skus: Sku[], spec: SpecItem): boolean {
    return spec.values.some((v) => specValueImage(skus, spec.name, v.value) !== undefined)
}

export interface PriceView {
    primary: Money
    rangeTo?: Money
    original?: Money
}

export function derivePriceView(detail: ProductDetail, selection: SkuSelection): PriceView {
    const matched = findMatchingSku(detail.skus, selection)
    if (matched) {
        return {
            primary: matched.price,
            original: strikethroughPrice(matched.originalPrice, matched.price),
        }
    }

    const { priceMin, priceMax } = detail.product
    return {
        primary: priceMin,
        rangeTo: sameMoney(priceMin, priceMax) ? undefined : priceMax,
    }
}

export type StockView =
    | { key: "product.stock.inStock"; stock: number }
    | { key: "product.stock.soldOut" }
    | { key: "product.stock.inStockGeneric" }
    | { key: "product.stock.outOfStock" }

export function deriveStockText(detail: ProductDetail, selection: SkuSelection): StockView {
    const matched = findMatchingSku(detail.skus, selection)
    if (matched) {
        return matched.stock > 0
            ? { key: "product.stock.inStock", stock: matched.stock }
            : { key: "product.stock.soldOut" }
    }
    return detail.skus.some((s) => s.stock > 0)
        ? { key: "product.stock.inStockGeneric" }
        : { key: "product.stock.outOfStock" }
}

export type ProductCardData = {
    id: string
    image: string | null
    title: string
    price: Money
    sales?: string
}

export function soldCountText(soldCount: number, locale: AppLocale): string | undefined {
    if (soldCount <= 0) return undefined
    return compactCount(soldCount, locale)
}

export function toProductCardData(p: Product, locale: AppLocale): ProductCardData {
    return {
        id: p.id,
        image: p.image,
        title: p.title,
        price: p.priceMin,
        sales: soldCountText(p.soldCount, locale),
    }
}

export function isSelectionComplete(detail: ProductDetail, selection: SkuSelection): boolean {
    if (detail.specs.length === 0) return true
    return detail.specs.every((spec) => selection[spec.name] !== undefined)
}
