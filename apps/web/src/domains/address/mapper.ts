import type { AddressView } from "@shop/api/sdk"

import type { Address } from "./rules"

/** wire 的 receiverName → 域内 receiver；契约字段已收紧为必有，直接透传 */
export function toAddress(dto: AddressView): Address {
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
