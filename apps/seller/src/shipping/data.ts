import type { ShippingTemplateRequest, ShippingTemplateResponse } from "@shop/api/sdk"
import { SellerShippingApi } from "@shop/api/sdk"
import { toApiError } from "@shop/common"

/** 本店运费模板：未设置时后端 404，这不是故障，返回 null 让页面进入新建态 */
export async function getShippingTemplate(): Promise<ShippingTemplateResponse | null> {
    try {
        return await SellerShippingApi.getShippingTemplate()
    } catch (error) {
        if (toApiError(error).status === 404) return null
        throw error
    }
}

/** 覆盖式保存整份模板 */
export async function saveShippingTemplate(
    input: ShippingTemplateRequest,
): Promise<ShippingTemplateResponse> {
    return await SellerShippingApi.saveShippingTemplate({ body: input })
}
