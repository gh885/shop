import { z } from "zod"

import type { CarrierResponse, Line, OrderItemResponse } from "@shop/api/sdk"
import { VALIDATION_RULES } from "@shop/common/contract"
import { TrackingNoSchema } from "@shop/common/domain"

// 运单号首尾空格清掉，承运商推送按运单号精确匹配（口径见 @shop/common 的 tracking.ts）
export const ShipSchema = z.object({
    carrierCode: z.string().min(1, { message: VALIDATION_RULES.REQUIRED }),
    trackingNo: TrackingNoSchema,
})

export type ShipFormValues = z.infer<typeof ShipSchema>

/** 一张发货单装哪些行、各几件：直接吃契约里的 `Line`，不手打第二份形状（shape-drift 门禁） */
export type ShipLine = Line

/** 算发量只关心这四列：卖家的发货表单不需要商品名/价格 */
export type ShipItem = Pick<
    OrderItemResponse,
    "orderItemId" | "quantity" | "shippedQuantity" | "refundedQuantity"
>

export interface ShipInput {
    carrierCode: string
    trackingNo: string
    lines: ShipLine[]
}

/**
 * 该行还能发几件 = 买了多少 − 已发出 − 已退。
 *
 * <p>退回的货不会回到可发池：退货走退款，对应的义务已经结清（§4.3 的 settled_quantity），
 * 再发一次就是超发——后端守卫会 409，前端先算对。
 */
export function remainingQuantity(item: ShipItem): number {
    return Math.max(0, item.quantity - item.shippedQuantity - item.refundedQuantity)
}

/** 打单选行：默认把每行剩余量都装进去（一次性发完是最常见的情况） */
export function defaultShipQuantities(items: readonly ShipItem[]): Record<string, number> {
    return Object.fromEntries(items.map((item) => [item.orderItemId, remainingQuantity(item)]))
}

/** 只提交发量 > 0 的行：0 件不占行，塞进请求只会被后端当成一条空行 */
export function shipLinesFromQuantities(
    items: readonly ShipItem[],
    quantities: Readonly<Record<string, number>>,
): ShipLine[] {
    return items.flatMap((item) => {
        const quantity = Math.min(
            remainingQuantity(item),
            Math.max(0, quantities[item.orderItemId] ?? 0),
        )
        return quantity > 0 ? [{ orderItemId: item.orderItemId, quantity }] : []
    })
}

// 运单号再 trim 一次：尾随一个空格就永远查不到轨迹，不赌上游是否已清过
export function shipInputFromForm(values: ShipFormValues, lines: ShipLine[]): ShipInput {
    return { carrierCode: values.carrierCode, trackingNo: values.trackingNo.trim(), lines }
}

// value 必须是字典 code（交请求），name 只是给人看的展示名——填反了就污染落库
export function carrierSelectItems(
    carriers: readonly CarrierResponse[],
): { value: string; label: string }[] {
    return carriers.map((carrier) => ({ value: carrier.code, label: carrier.name }))
}
