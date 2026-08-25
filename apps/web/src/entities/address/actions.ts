import { z } from "zod"

import { api } from "#/shared/api/client"

import {
    AddressParseSchema,
    AddressSchema,
    type Address,
    type AddressInput,
    type AddressParse,
} from "./model"

/**
 * Address 数据层读写命令（纯逻辑，不含 React Query / React）。
 * features 在此之上再包 hooks（use-address.ts），本文件保持可被 SSR / 组件 / 测试任意调用。
 * 读命令走 api.request（响应过 Zod 校验、错误已归一化）；无响应体的删除走 api.raw。
 */

/** 私有：写方向请求体（业务入参 → wire） */
interface AddressRequest {
    receiverName: string
    phone: string
    regionCode: string
    province: string
    city: string
    district: string
    detail: string
    label?: string
    isDefault?: boolean
}

export function toAddressRequest(input: AddressInput): AddressRequest {
    return {
        receiverName: input.receiver,
        phone: input.phone,
        regionCode: input.regionCode,
        province: input.province,
        city: input.city,
        district: input.district,
        detail: input.detail,
        label: input.label,
        isDefault: input.isDefault,
    }
}

/** 我的地址列表：默认置顶，其余按创建时间倒序 */
export async function listAddresses(): Promise<Address[]> {
    return api.request(z.array(AddressSchema), "user/addresses")
}

/** 地址详情（结算页反显用） */
export async function getAddress(id: string): Promise<Address> {
    return api.request(AddressSchema, `user/addresses/${id}`)
}

/** 新增收货地址 */
export async function createAddress(input: AddressInput): Promise<Address> {
    return api.request(AddressSchema, "user/addresses", {
        method: "POST",
        json: toAddressRequest(input),
    })
}

/** 修改收货地址 */
export async function updateAddress(id: string, input: AddressInput): Promise<Address> {
    return api.request(AddressSchema, `user/addresses/${id}`, {
        method: "PUT",
        json: toAddressRequest(input),
    })
}

/** 删除收货地址（软删，返回 204 无响应体） */
export async function deleteAddress(id: string): Promise<void> {
    await api.raw.delete(`user/addresses/${id}`)
}

/** 智能粘贴：解析收货文本为结构化字段 */
export async function parseAddressText(text: string): Promise<AddressParse> {
    return api.request(AddressParseSchema, "user/addresses/parse", {
        method: "POST",
        json: { text },
    })
}

/** 设为默认地址：每用户至多一个 */
export async function setDefaultAddress(id: string): Promise<Address> {
    return api.request(AddressSchema, `user/addresses/${id}/default`, { method: "PUT" })
}

/** 取消默认地址：允许无默认地址 */
export async function unsetDefaultAddress(id: string): Promise<Address> {
    return api.request(AddressSchema, `user/addresses/${id}/default`, { method: "DELETE" })
}
