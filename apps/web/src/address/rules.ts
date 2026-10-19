import { ADDRESS_LABELS } from "./constants"

/** 本域业务规则出口：地址形状与选中判定。展示词表在 constants.ts，标签展示解析在 display.ts */

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

/** 新增/修改地址的表单入参：只有用户真填的那几项。 */
export type AddressInput = Omit<Address, "id" | "province" | "city" | "district" | "isDefault"> & {
    isDefault?: boolean
}

/** 智能粘贴解析结果（缺失字段为 undefined）。 */
export type AddressParse = Partial<Pick<Address, "receiver" | "phone" | "regionCode" | "detail">>

/** 命中内置标签表。类型守卫：`in` 把 string 收窄成 ADDRESS_LABELS 的键（`in` 本身不收窄） */
export function isBuiltinLabel(label: string): label is keyof typeof ADDRESS_LABELS {
    return label in ADDRESS_LABELS
}

function defaultAddress(addresses: Address[]): Address | undefined {
    return addresses.find((a) => a.isDefault) ?? addresses[0]
}

/**
 * 当前选中的地址 id：用户勾的 > 默认地址 > 空串（= 一条都没有）。
 */
export function pickedAddressId(addresses: Address[], chosen?: string): string {
    return chosen || defaultAddress(addresses)?.id || ""
}
