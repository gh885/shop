import { fenToYuan } from "@shop/api"

import type { ProductDetail, Sku, SpecItem } from "#/entities/product"

/**
 * 商品详情交互纯逻辑（无 React）：规格选择 → SKU 匹配 → 可选性/价格派生。
 * use-sku-selection 在此之上包状态，purchase-panel / gallery 只消费结果。
 */

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
