import { z } from "zod"

import { VALIDATION_RULES } from "@shop/common/contract"
import {
    ADDRESS_DETAIL_MAX,
    ADDRESS_NAME_MAX,
    AddressDetailSchema,
    AddressPhoneSchema,
    COMPANY_NAME_MAX,
    CONTACT_PHONE_MAX,
    NOTE_MAX,
    POSTAL_CODE_MAX,
    regionCodeSchema,
    withMaxLength,
} from "@shop/common/domain"
import type { MerchantAddressResponse } from "@shop/api/sdk"

import { messageFactFactory } from "@shop/common/i18n"

import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

/**
 * shop/address/address-form —— 商家地址表单的纯逻辑：入参校验、初值、字段清单。
 * 与组件同域但不碰 React：弹窗只负责渲染与编排，这些决定单独可测（对齐 web 的 address-form）。
 *
 * 号码/区划码/详址的口径与买家收货地址同源（@shop/common 的 address），两边差别只在必填项：
 * 商家这边联系人换名字、区级不再单列（省市区名一律由 regionCode 派生，见 queries.ts），
 * 外加邮编/公司名/备注这三个面单字段。
 *
 * 句子这一层：必填与上下限复用 `validation.*`（与 422 那条通道同一个概念同一句话，§6.1），
 * 只有「还没选地区」这一句要单独说——通用句不指出该去点选择器，规则由 `regionCodeSchema` 收在 common，
 * 句子留在本端 catalog。
 */
type ShopErrKey = Extract<SellerMessageKey, `seller.shop.err.${string}`>
const err = messageFactFactory<ShopErrKey, SellerParamsByKey>()

export const AddressFormSchema = z.object({
    contactName: withMaxLength(
        z.string().trim().min(1, { message: VALIDATION_RULES.REQUIRED }),
        ADDRESS_NAME_MAX,
    ),
    phone: AddressPhoneSchema,
    regionCode: regionCodeSchema(err("seller.shop.err.regionRequired")),
    detail: AddressDetailSchema,
    postalCode: z
        .string()
        .trim()
        .regex(new RegExp(`^\\d{${POSTAL_CODE_MAX}}$`), { message: VALIDATION_RULES.PATTERN })
        .optional()
        .or(z.literal("")),
    companyName: withMaxLength(z.string().trim(), COMPANY_NAME_MAX).optional(),
    note: withMaxLength(z.string().trim(), NOTE_MAX).optional(),
    defaultShip: z.boolean(),
    defaultReturn: z.boolean(),
})

/** 表单值（= 新增/编辑的入参形状）：用户填的那几项，不含省市区名 */
export type AddressFormValues = z.infer<typeof AddressFormSchema>

export const CONTACT_FIELDS = [
    {
        name: "contactName",
        label: "联系人姓名",
        placeholder: "请输入联系人",
        maxLength: ADDRESS_NAME_MAX,
    },
    {
        name: "phone",
        label: "联系电话",
        placeholder: "请输入手机号",
        maxLength: CONTACT_PHONE_MAX,
        inputMode: "tel",
    },
] as const

export const ADDRESS_FIELDS = [
    {
        name: "detail",
        label: "详细地址",
        placeholder: "不需要重复输入省/市/区",
        maxLength: ADDRESS_DETAIL_MAX,
        required: true,
    },
    {
        name: "postalCode",
        label: "邮政编码",
        placeholder: "填写邮政编码（可选）",
        maxLength: POSTAL_CODE_MAX,
    },
    {
        name: "companyName",
        label: "公司名称",
        placeholder: "填写地址所属的公司名称（面单寄件人）",
        maxLength: COMPANY_NAME_MAX,
    },
    { name: "note", label: "备注", placeholder: "填写备注（可选）", maxLength: NOTE_MAX },
] as const

/** 编辑目标 → 表单初值（新增模式逐字段落空串、两个默认标记落 false） */
export function toDefaults(a?: MerchantAddressResponse): AddressFormValues {
    return {
        contactName: a?.contactName ?? "",
        phone: a?.phone ?? "",
        regionCode: a?.regionCode ?? "",
        detail: a?.detail ?? "",
        postalCode: a?.postalCode ?? "",
        companyName: a?.companyName ?? "",
        note: a?.note ?? "",
        defaultShip: a?.defaultShip ?? false,
        defaultReturn: a?.defaultReturn ?? false,
    }
}
