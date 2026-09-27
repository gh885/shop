import { PDP_MAX_QUANTITY } from "./constants"

/**
 * 加购数量的三条规则：下界、上界、以及按上界收敛/步进。
 *
 * 详情页里「展示值」和「提交值」必须同源——步进器显示 1 而购物车提交 5，或者反过来
 * 让用户看到一个假的数字，都是同一份收敛算了两遍才会出的事。
 * 所以 route、组屏、步进器三处读同一个函数，不各自 `Math.min`。
 *
 * - 下界保 1：售罄时显示 1 而不是 0。售罄由 PurchaseCta 的 complete/库存判定来表达，
 *   数量框不越权替它表达状态（显示 0 还会让步进器的减号看起来是坏的）。
 * - 上界跟选中 SKU 的库存；没选全规格时退回单条展示上限 `PDP_MAX_QUANTITY`。
 */

/** 数量下界，也是售罄时展示的那个数 */
export const QUANTITY_FLOOR = 1

/** 当前可选的数量上界（售罄库存 0 收到下界，不给出 0 这个上界） */
export function quantityUpperBound(stock: number | null | undefined): number {
    return Math.max(QUANTITY_FLOOR, stock ?? PDP_MAX_QUANTITY)
}

/** 把用户已选的数量收敛到当前上界内（规格切换后库存变少时用它） */
export function clampPurchaseQuantity(quantity: number, stock: number | null | undefined): number {
    return Math.min(quantity, quantityUpperBound(stock))
}

/** 步进一档，落在 [QUANTITY_FLOOR, 上界] 内 */
export function stepPurchaseQuantity(
    quantity: number,
    delta: 1 | -1,
    stock: number | null | undefined,
): number {
    return Math.min(quantityUpperBound(stock), Math.max(QUANTITY_FLOOR, quantity + delta))
}
