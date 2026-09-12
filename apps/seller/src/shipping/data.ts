import type { Money, ShippingTemplateRequest, ShippingTemplateResponse } from "@shop/api/sdk"
import { SellerShippingApi } from "@shop/api/sdk"
import { toApiError } from "@shop/common"

/**
 * 契约把「满额包邮门槛」声明成 `Money | null`（后端 `@Schema(nullable = true)`），
 * 但 springdoc 对 $ref 属性输出成 `{ type: "null", $ref: … }`，openapi-ts 只取 $ref，
 * 生成物于是变成非空 Money。后端在未设置满额包邮 / 开启全场包邮时确实发 null，
 * 响应校验会误报，故在 SDK 边界两件事一起做：透传 validator + 把这一列修回真实可空。
 *
 * 等后端 OpenAPI 的 nullable 表达修正并重新生成 SDK 后，本文件的修正即可整段删掉。
 */
export type ShippingTemplate = Omit<ShippingTemplateResponse, "freeOverAmount"> & {
    freeOverAmount: Money | null
}

async function passthroughResponse(data: unknown) {
    return data
}

/** 本店运费模板：未设置时后端 404，这不是故障，返回 null 让页面进入新建态 */
export async function getShippingTemplate(): Promise<ShippingTemplate | null> {
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
): Promise<ShippingTemplate> {
    return await SellerShippingApi.saveShippingTemplate({
        body: input,
        responseValidator: passthroughResponse,
    })
}
