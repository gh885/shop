import type { AddressResponse } from "@shop/api/sdk"

import type { Address } from "./rules"

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
