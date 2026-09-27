import { z } from "zod"

import type { CarrierResponse } from "@shop/api/sdk"
import { TrackingNoSchema } from "@shop/common"

/**
 * 发货表单的纯规则：校验 + 「表单值 → 提交体」+ 承运商字典投影。
 *
 * 承运商是自由文本升级来的：同一个顺丰曾能写出五种字，落库后既没法统计也没法对接物流商接口，
 * 所以这一层唯一要紧的决定是**交出去的是字典 code，展示名只用于给人看**
 * （规则见 docs/business-rules/logistics.md LOG-70）。
 * 那条决定不依赖 React，就必须在 node 下能被单测钉住——否则改一次下拉文案就可能把 name 写回 value。
 */

/** 承运商走字典 code；运单号首尾空格清掉，承运商推送按运单号精确匹配（口径见 @shop/common 的 tracking.ts） */
export const ShipSchema = z.object({
    carrierCode: z.string().min(1, "请选择快递公司"),
    trackingNo: TrackingNoSchema,
})

export type ShipFormValues = z.infer<typeof ShipSchema>

/** 交回容器的提交体（mutation 拿它拼请求，弹窗与容器之间只有这一个形状） */
export interface ShipInput {
    carrierCode: string
    trackingNo: string
}

/** 提交体：运单号再 trim 一次（尾随一个空格就永远查不到轨迹，这句不赌上游是否已清过） */
export function shipInputFromForm(values: ShipFormValues): ShipInput {
    return { carrierCode: values.carrierCode, trackingNo: values.trackingNo.trim() }
}

/** 承运商字典 → 下拉项：value 给请求（code），label 给人（后端按字典归一的展示名） */
export function carrierSelectItems(
    carriers: readonly CarrierResponse[],
): { value: string; label: string }[] {
    return carriers.map((carrier) => ({ value: carrier.code, label: carrier.name }))
}
