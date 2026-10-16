import { z } from "zod"

import type { CarrierResponse } from "@shop/api/sdk"
import { VALIDATION_RULES } from "@shop/common/contract"
import { TrackingNoSchema } from "@shop/common/domain"

// 运单号首尾空格清掉，承运商推送按运单号精确匹配（口径见 @shop/common 的 tracking.ts）
export const ShipSchema = z.object({
    carrierCode: z.string().min(1, { message: VALIDATION_RULES.REQUIRED }),
    trackingNo: TrackingNoSchema,
})

export type ShipFormValues = z.infer<typeof ShipSchema>

export interface ShipInput {
    carrierCode: string
    trackingNo: string
}

// 运单号再 trim 一次：尾随一个空格就永远查不到轨迹，不赌上游是否已清过
export function shipInputFromForm(values: ShipFormValues): ShipInput {
    return { carrierCode: values.carrierCode, trackingNo: values.trackingNo.trim() }
}

// value 必须是字典 code（交请求），name 只是给人看的展示名——填反了就污染落库
export function carrierSelectItems(
    carriers: readonly CarrierResponse[],
): { value: string; label: string }[] {
    return carriers.map((carrier) => ({ value: carrier.code, label: carrier.name }))
}
