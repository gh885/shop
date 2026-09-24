import { z } from "zod"

import {
    ADDRESS_LABEL_MAX,
    ADDRESS_NAME_MAX,
    AddressDetailSchema,
    AddressPhoneSchema,
    AddressRegionCodeSchema,
} from "@shop/common"

import { ADDRESS_LABELS, type Address, type AddressInput } from "./address"

/**
 * address/address-form —— 地址表单的纯逻辑：入参校验、初值、标签判定。
 * 与组件同域但不碰 React：弹窗只负责渲染与编排，这些决定单独可测。
 *
 * 号码/区划码/详址的口径与商家地址同源（@shop/common 的 address），这里只补买家侧特有的那几项：
 * 收货人、标签、默认地址。省市区名**不是表单字段**——它们由 regionCode 在提交时反查（queries.ts）。
 */
export const AddressInputSchema = z.object({
    receiver: z
        .string()
        .trim()
        .min(1, "请输入收货人")
        .max(ADDRESS_NAME_MAX, `收货人最长 ${ADDRESS_NAME_MAX} 字`),
    phone: AddressPhoneSchema,
    regionCode: AddressRegionCodeSchema,
    detail: AddressDetailSchema,
    label: z.string().max(ADDRESS_LABEL_MAX).optional(),
    isDefault: z.boolean().optional(),
})

/** 内置标签选项（code/展示名单一来源在 ./address 的 ADDRESS_LABELS） */
export const LABEL_OPTIONS = Object.entries(ADDRESS_LABELS).map(([value, label]) => ({
    value,
    label,
}))

/** 自定义标签字数上限 */
export const CUSTOM_LABEL_MAX = 4

/**
 * 编辑目标 → 表单初值：TanStack Form 要完整形状，故新增模式（undefined）逐字段落空串，
 * 并带上新建的两个默认决定——标签默认「家」、默认不设为默认地址。
 * 省市区名不进来：初值只需要 regionCode，名字在提交时反查。
 */
export function toDefaults(a?: Address): AddressInput {
    return {
        receiver: a?.receiver ?? "",
        phone: a?.phone ?? "",
        regionCode: a?.regionCode ?? "",
        detail: a?.detail ?? "",
        label: a?.label ?? "HOME",
        isDefault: a?.isDefault ?? false,
    }
}

/** 命中内置标签表（空/未选一律 false） */
export function isBuiltinLabel(value?: string): boolean {
    return LABEL_OPTIONS.some((l) => l.value === value)
}

/** 自定义标签：有值且不在内置表里。空串是「未选」，不该展开自定义输入框 */
export function isCustomLabel(value?: string): boolean {
    return value !== undefined && value !== "" && !isBuiltinLabel(value)
}
