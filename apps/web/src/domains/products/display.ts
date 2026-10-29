import type { Money } from "@shop/common/domain"

import type { Product } from "./rules"

/** 本域展示函数的出口：商品卡视图投影。常量在 constants.ts，判定与类型在 rules.ts */

export type ProductCardData = {
    id: string
    image: string | null
    title: string
    /** 契约可空：有挂售但 SKU 全停用 = 暂无报价（BuyerProductCard.minPrice） */
    price: Money | null
}

export function toProductCardData(p: Product): ProductCardData {
    return {
        id: p.spuId,
        image: p.imageUrl,
        title: p.title,
        price: p.minPrice,
    }
}
