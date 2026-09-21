import { z } from "zod"

import { ADDRESS_LABELS, type Address, type AddressInput } from "./address"

/**
 * address/address-form —— 地址表单的纯逻辑：入参校验、初值、标签判定。
 * 与组件同域但不碰 React：弹窗只负责渲染与编排，这些决定单独可测。
 */

/** 表单入参校验（form validators 用；表单局部 schema，非领域契约） */
export const AddressInputSchema = z.object({
    receiver: z.string().trim().min(1, "请输入收货人").max(30, "收货人最长 30 字"),
    phone: z.string().regex(/^[0-9+-]{5,20}$/, "手机号格式不正确"),
    regionCode: z.string().trim().min(1, "请选择所在地区").max(12),
    province: z.string().trim().min(1, "请选择所在地区").max(30),
    city: z.string().trim().min(1, "请选择所在地区").max(30),
    district: z.string().trim().min(1, "请选择所在地区").max(30),
    detail: z.string().trim().min(1, "请输入详细地址").max(120, "详细地址最长 120 字"),
    label: z.string().max(20).optional(),
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
 */
export function toDefaults(a?: Address): AddressInput {
    return {
        receiver: a?.receiver ?? "",
        phone: a?.phone ?? "",
        regionCode: a?.regionCode ?? "",
        province: a?.province ?? "",
        city: a?.city ?? "",
        district: a?.district ?? "",
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
