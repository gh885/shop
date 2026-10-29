import { z } from "zod"

import type { SellerOrderLineView } from "@shop/api/sdk"
import { VALIDATION_RULES } from "@shop/common/contract"
import { TrackingNoSchema } from "@shop/common/domain"

// 运单号首尾空格清掉，承运商推送按运单号精确匹配（口径见 @shop/common 的 tracking.ts）
export const ShipSchema = z.object({
    carrierCode: z.string().min(1, { message: VALIDATION_RULES.REQUIRED }),
    trackingNo: TrackingNoSchema,
})

export type ShipFormValues = z.infer<typeof ShipSchema>

/** 一张发货单装哪些行、各几件：后端按 lineNo 定位（不是行 id），quantity 是本次发多少 */
export interface ShipItem {
    lineNo: number
    quantity: number
}

/** 算发量只关心这几列：卖家的发货表单不需要商品名/价格 */
export type ShipLineSource = Pick<
    SellerOrderLineView,
    "lineNo" | "quantity" | "shippedQty" | "refundedQty" | "remaining"
>

export interface ShipInput {
    carrierCode: string
    trackingNo: string
    items: ShipItem[]
}

/**
 * 该行还能发几件 = 买了多少 − 已发出 − 已退。
 *
 * <p>退回的货不会回到可发池：退货走退款，对应的义务已经结清，再发一次就是超发——
 * 后端守卫会 409，前端先算对。后端也给了 `remaining`，两者应一致；以本地算的为准，
 * 因为它跟随用户在弹窗里的改动。
 */
export function remainingQuantity(line: ShipLineSource): number {
    return Math.max(0, line.quantity - line.shippedQty - line.refundedQty)
}

/** 打单选行：默认把每行剩余量都装进去（一次性发完是最常见的情况） */
export function defaultShipQuantities(lines: readonly ShipLineSource[]): Record<number, number> {
    return Object.fromEntries(lines.map((line) => [line.lineNo, remainingQuantity(line)]))
}

/** 只提交发量 > 0 的行：0 件不占行，塞进请求只会被后端当成一条空行 */
export function shipLinesFromQuantities(
    lines: readonly ShipLineSource[],
    quantities: Readonly<Record<number, number>>,
): ShipItem[] {
    return lines.flatMap((line) => {
        const quantity = Math.min(
            remainingQuantity(line),
            Math.max(0, quantities[line.lineNo] ?? 0),
        )
        return quantity > 0 ? [{ lineNo: line.lineNo, quantity }] : []
    })
}

// 运单号再 trim 一次：尾随一个空格就永远查不到轨迹，不赌上游是否已清过
export function shipInputFromForm(values: ShipFormValues, items: ShipItem[]): ShipInput {
    return { carrierCode: values.carrierCode, trackingNo: values.trackingNo.trim(), items }
}

/**
 * 承运商码表。后端是代码里的白名单（`fulfillment/model/Carriers`），没有列表端点——
 * 这里同步一份，填错码后端当场 400。新增承运商要两边一起改。
 */
export const CARRIERS: readonly { value: string; label: string }[] = [
    { value: "sf", label: "顺丰速运" },
    { value: "ems", label: "中国邮政EMS" },
    { value: "zto", label: "中通快递" },
    { value: "yto", label: "圆通速递" },
    { value: "sto", label: "申通快递" },
    { value: "yunda", label: "韵达快递" },
    { value: "jt", label: "极兔速递" },
    { value: "jd", label: "京东物流" },
    { value: "deppon", label: "德邦快递" },
]
