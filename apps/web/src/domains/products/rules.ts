import type { Money } from "@shop/common/domain"
import type { BuyerProductCard, ProductDetail as ProductDetailDto } from "@shop/api/sdk"

/** 商品卡（列表/feed）：契约 `BuyerProductCard` 直用，shopId 可空（同款比价场景） */
export type Product = BuyerProductCard

export type Sku = ProductDetailDto["skus"][number]

/** 规格维度：从 SKU 的 specs 键聚合（契约不单独下发规格组） */
export type SpecGroup = { name: string; values: string[] }

/**
 * 商品详情：契约 `ProductDetail` 直通 + 派生的规格维度。
 *
 * <p>契约没有 maxPrice / shop / originalPrice——旧详情页对应展示位（划线价、店铺栏）
 * 已一并移除，不拿空值占位。subtitle / soldCount / detailImages 契约有，页面此前也没渲染。
 */
export type ProductDetail = ProductDetailDto & { specGroups: SpecGroup[] }

/** 规格维度 = SKU specs 键的并集，值保持首次出现顺序（同色不同码会相邻） */
export function deriveSpecGroups(skus: Sku[]): SpecGroup[] {
    const groups = new Map<string, string[]>()
    for (const sku of skus) {
        for (const [name, value] of Object.entries(sku.specs)) {
            const values = groups.get(name) ?? []
            if (!values.includes(value)) values.push(value)
            groups.set(name, values)
        }
    }
    return [...groups].map(([name, values]) => ({ name, values }))
}

/** 规格选择状态：维度名 → 已选值。未选的维度不出现在记录里（允许部分选择） */
export type SkuSelection = Record<string, string>

export function findMatchingSku(skus: Sku[], selection: SkuSelection): Sku | undefined {
    const entries = Object.entries(selection)
    if (entries.length === 0) return undefined
    return skus.find((sku) => entries.every(([name, value]) => sku.specs[name] === value))
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
            sku.availableToPromise > 0 &&
            Object.entries(constrained).every(([name, v]) => sku.specs[name] === v),
    )
}

export interface PriceView {
    primary: Money
    original?: Money
}

/** 价格口径：选中 SKU 用 SKU 价，未选全用 minPrice（契约没有价格区间） */
export function derivePriceView(detail: ProductDetail, selection: SkuSelection): PriceView {
    const matched = findMatchingSku(detail.skus, selection)
    return { primary: matched ? matched.price : detail.minPrice }
}

export type StockView =
    | { key: "product.stock.inStockGeneric" }
    | { key: "product.stock.soldOut" }
    | { key: "product.stock.outOfStock" }

export function deriveStockText(detail: ProductDetail, selection: SkuSelection): StockView {
    const matched = findMatchingSku(detail.skus, selection)
    if (matched) {
        return matched.availableToPromise > 0
            ? { key: "product.stock.inStockGeneric" }
            : { key: "product.stock.soldOut" }
    }
    return detail.skus.some((s) => s.availableToPromise > 0)
        ? { key: "product.stock.inStockGeneric" }
        : { key: "product.stock.outOfStock" }
}

export function isSelectionComplete(detail: ProductDetail, selection: SkuSelection): boolean {
    if (detail.specGroups.length === 0) return true
    return detail.specGroups.every((group) => selection[group.name] !== undefined)
}
