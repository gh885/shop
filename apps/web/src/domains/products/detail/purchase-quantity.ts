import { PDP_MAX_QUANTITY } from "./constants"

export const QUANTITY_FLOOR = 1

export function quantityUpperBound(stock: number | null | undefined): number {
    return Math.max(QUANTITY_FLOOR, stock ?? PDP_MAX_QUANTITY)
}

export function clampPurchaseQuantity(quantity: number, stock: number | null | undefined): number {
    return Math.min(quantity, quantityUpperBound(stock))
}

export function stepPurchaseQuantity(
    quantity: number,
    delta: 1 | -1,
    stock: number | null | undefined,
): number {
    return Math.min(quantityUpperBound(stock), Math.max(QUANTITY_FLOOR, quantity + delta))
}
