/**
 * address 模块 —— 纯逻辑（类型 + wire→投影）。不碰 React / 网络。
 * 地址的「规则」（默认唯一性、完整性、手机号合法性）由后端裁决，前端不复刻；
 * 表单侧唯一镜像的是字段口径，那份和商家地址共用，在 @shop/common 的 address。
 * 这里只有投影映射、类型，和一条不写第二遍的「选中哪一条」判据。
 */

import type { AddressResponse } from "@shop/api/sdk"

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

/**
 * 新增/修改地址的表单入参：只有用户真填的那几项。
 * 省市区名不在表单里——它们是 regionCode 的派生值，提交时按区划库反查（@shop/common 的
 * regionNamesByCode）；isDefault 可缺省（后端：新增视为 false、修改保持原值）。
 */
export type AddressInput = Omit<Address, "id" | "province" | "city" | "district" | "isDefault"> & {
    isDefault?: boolean
}

/** 智能粘贴解析结果（缺失字段为 undefined）。服务端也回省市区名，但表单不信那份：
 *  名字一律按 regionCode 反查，才和级联选择器显示的同一条路径（见 @shop/common address）。 */
export type AddressParse = Partial<Pick<Address, "receiver" | "phone" | "regionCode" | "detail">>

/** 内置地址标签 code → 展示名（与后端 Address.LABEL_* 对齐）：表单选项与列表展示共用的单一来源 */
export const ADDRESS_LABELS = {
    HOME: "家",
    WORK: "公司",
    SCHOOL: "学校",
    PARENTS: "父母家",
    FRIEND: "朋友家",
} as const

/** 命中内置标签表。类型守卫：`in` 把 string 收窄成 ADDRESS_LABELS 的键（`in` 本身不收窄） */
export function isBuiltinLabel(label: string): label is keyof typeof ADDRESS_LABELS {
    return label in ADDRESS_LABELS
}

/** 标签展示名：内置标签查表，自定义标签按原样文本读回（用户自己写的那句），未选给 undefined */
export function labelName(label?: string): string | undefined {
    if (!label) return undefined
    return isBuiltinLabel(label) ? ADDRESS_LABELS[label] : label
}

/**
 * 默认地址：打了标记的那条，没有则列表第一条。
 *
 * 顺序权在后端（`AddressMapper` 按 `is_default desc, created_at desc` 返回，即默认在前、其次最新），
 * 所以「没有标记就取第一条」用的就是那份顺序，不在这里再排一次——在这里排序等于把同一条规则的第二份
 * 答案写进投影层。
 */
function defaultAddress(addresses: Address[]): Address | undefined {
    return addresses.find((a) => a.isDefault) ?? addresses[0]
}

/**
 * 当前选中的地址 id：用户勾的 > 默认地址 > 空串（= 一条都没有）。
 *
 * 结算页此前把这条规则写了两遍：页面顶部算 `effectiveAddressId`，地址卡片里再算一遍 `effectiveId`，
 * 而第二遍写的是 `addresses[0]!`——列表为空时它不是「没选中」而是抛异常，只靠组件头上那个 early return
 * 兜着。一条规则两个答案，改了一边就会出现「预览按 A 算运费、卡片高亮 B」。
 */
export function pickedAddressId(addresses: Address[], chosen?: string): string {
    return chosen || defaultAddress(addresses)?.id || ""
}
