import { compactCount, type Money } from "@shop/common/domain"
import type { AppLocale } from "@shop/i18n"

import type { Product } from "./rules"

/** 本域展示函数的出口：销量折位、商品卡视图投影。常量在 constants.ts，判定与类型在 rules.ts */

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
