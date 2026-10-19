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

/** 内置地址标签 code → 展示文案的 i18n key（与后端 Address.LABEL_* 对齐）：*/
export const ADDRESS_LABELS = {
    HOME: "address.tag.HOME",
    WORK: "address.tag.WORK",
    SCHOOL: "address.tag.SCHOOL",
    PARENTS: "address.tag.PARENTS",
    FRIEND: "address.tag.FRIEND",
} as const

/** 命中内置标签表。类型守卫：`in` 把 string 收窄成 ADDRESS_LABELS 的键（`in` 本身不收窄） */
export function isBuiltinLabel(label: string): label is keyof typeof ADDRESS_LABELS {
    return label in ADDRESS_LABELS
}

/** 内置标签 i18n key 的联合（= ADDRESS_LABELS 的值），供渲染处直接喂给 `t()` */
export type BuiltinLabelKey = (typeof ADDRESS_LABELS)[keyof typeof ADDRESS_LABELS]

/** 标签展示解析的结果：内置标签回其 i18n key（渲染处 `t()` 解析），自定义标签回原样用户文本（不翻译）。 */
export type LabelDisplay = { kind: "key"; key: BuiltinLabelKey } | { kind: "text"; text: string }

/** 标签展示解析：内置标签查表回 key，自定义标签按原样文本读回（用户自己写的那句），未选给 undefined */
export function labelName(label?: string): LabelDisplay | undefined {
    if (!label) return undefined
    return isBuiltinLabel(label)
        ? { kind: "key", key: ADDRESS_LABELS[label] }
        : { kind: "text", text: label }
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
