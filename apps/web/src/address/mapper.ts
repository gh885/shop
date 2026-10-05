import type { AddressResponse } from "@shop/api/sdk"

import type { Address } from "./address"

/**
 * address/mapper —— wire → 领域投影（纯映射，不碰 React / 网络）。
 *
 * 地址的「规则」（默认唯一性、完整性、手机号合法性）由后端裁决，前端不复刻；
 * 这里只做字段口径的归一。
 */

/** wire → 业务：AddressResponse.receiverName → Address.receiver，其余字段同名透传 */
export function toAddress(dto: AddressResponse): Address {
    return {
        id: dto.id,
        receiver: dto.receiverName,
        phone: dto.phone,
        regionCode: dto.regionCode,
        province: dto.province,
        city: dto.city,
        district: dto.district,
        detail: dto.detail,
        label: dto.label,
        isDefault: dto.isDefault,
    }
}
