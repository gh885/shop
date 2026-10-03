import { z } from "zod"

import { VALIDATION_RULES } from "@shop/common/contract"
import {
    ADDRESS_LABEL_MAX,
    ADDRESS_NAME_MAX,
    AddressDetailSchema,
    AddressPhoneSchema,
    regionCodeSchema,
    withMaxLength,
} from "@shop/common/domain"

import type { WebMessageKey } from "#/locales/messages.gen"

import { ADDRESS_LABELS, isBuiltinLabel, type Address, type AddressInput } from "./address"

/**
 * address/address-form —— 地址表单的纯逻辑：入参校验、初值、标签判定。
 * 与组件同域但不碰 React：弹窗只负责渲染与编排，这些决定单独可测。
 *
 * 号码/区划码/详址的口径与商家地址同源（@shop/common 的 address），这里只补买家侧特有的那几项：
 * 收货人、标签、默认地址。省市区名**不是表单字段**——它们由 regionCode 在提交时反查（queries.ts）。
 *
 * 句子：必填与长度上下限复用 `validation.*`（与 422 同一概念同一句，§6.1），只有「还没选地区」
 * 这一句要单独说——通用句不指出该去点选择器。
 */
type WebErrKey = Extract<WebMessageKey, `web.address.err.${string}`>
const err = (key: WebErrKey) => ({ message: key })

export const AddressInputSchema = z.object({
    receiver: withMaxLength(
        z.string().trim().min(1, { message: VALIDATION_RULES.REQUIRED }),
        ADDRESS_NAME_MAX,
    ),
    phone: AddressPhoneSchema,
    regionCode: regionCodeSchema(err("web.address.err.regionRequired")),
    detail: AddressDetailSchema,
    label: withMaxLength(z.string(), ADDRESS_LABEL_MAX).optional(),
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

/** 命中内置标签表：判定住在 ./address（表的 owner），这里只透给表单 */
export { isBuiltinLabel } from "./address"

/** 自定义标签：有值且不在内置表里。空串是「未选」，不该展开自定义输入框 */
export function isCustomLabel(value?: string): boolean {
    return value !== undefined && value !== "" && !isBuiltinLabel(value)
}
