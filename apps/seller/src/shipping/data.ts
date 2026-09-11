import type { ShippingTemplateRequest, ShippingTemplateResponse } from "@shop/api/sdk"
import { SellerShippingApi } from "@shop/api/sdk"
import { toApiError } from "@shop/common"

/**
 * 当前契约里 freeOverAmount 是 `Money | null`，但 openapi-ts 生成的 zod 把它收窄成
 * 非空 Money。未设置满额包邮时后端返回 null，响应校验会误报。这里先用透传 validator
 * 取业务数据，等后端 OpenAPI 的 nullable 表达修正并重新生成 SDK 后即可删掉。
 */
async function passthroughResponse(data: unknown) {
    return data
}

/** 本店运费模板：未设置时后端 404，这不是故障，返回 null 让页面进入新建态 */
export async function getShippingTemplate(): Promise<ShippingTemplateResponse | null> {
    try {
        return await SellerShippingApi.getShippingTemplate({
            responseValidator: passthroughResponse,
        })
    } catch (error) {
        if (toApiError(error).status === 404) return null
        throw error
    }
}

/** 覆盖式保存整份模板 */
export async function saveShippingTemplate(
    input: ShippingTemplateRequest,
): Promise<ShippingTemplateResponse> {
    return await SellerShippingApi.saveShippingTemplate({
        body: input,
        responseValidator: passthroughResponse,
    })
}
