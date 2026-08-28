import type { AddressResponse } from "@shop/api/sdk"

/**
 * address 模块 —— 纯逻辑（类型 + wire→投影）。不碰 React / 网络。
 * 地址的「规则」（默认唯一性、完整性、手机号合法性）由后端裁决，前端不复刻；
 * 这里只有投影映射与类型。
 */

/** 地址业务形状（wire 的 receiverName → receiver 归一） */
export type Address = {
    id: string
    receiver: string
    phone: string
    regionCode: string
    province: string
    city: string
    district: string
    detail: string
    label?: string
    isDefault: boolean
}

/** 新增/修改地址的表单入参（业务形状，receiver 而非 receiverName） */
export type AddressInput = {
    receiver: string
    phone: string
    regionCode: string
    province: string
    city: string
    district: string
    detail: string
    label?: string
    isDefault?: boolean
}

/** 智能粘贴解析结果（wire → 业务形状，缺失字段为 undefined） */
export type AddressParse = {
    receiver?: string
    phone?: string
    regionCode?: string
    province?: string
    city?: string
    district?: string
    detail?: string
}

/** wire → 投影：receiverName → receiver，label 归一 undefined */
export function toAddress(dto: AddressResponse): Address {
    return {
        id: dto.id ?? "",
        receiver: dto.receiverName ?? "",
        phone: dto.phone ?? "",
        regionCode: dto.regionCode ?? "",
        province: dto.province ?? "",
        city: dto.city ?? "",
        district: dto.district ?? "",
        detail: dto.detail ?? "",
        label: dto.label ?? undefined,
        isDefault: dto.isDefault ?? false,
    }
}
