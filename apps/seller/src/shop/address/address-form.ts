import { z } from "zod"

import {
    ADDRESS_DETAIL_MAX,
    ADDRESS_NAME_MAX,
    COMPANY_NAME_MAX,
    CONTACT_PHONE_MAX,
    NOTE_MAX,
    POSTAL_CODE_MAX,
    AddressDetailSchema,
    AddressPhoneSchema,
    AddressRegionCodeSchema,
} from "@shop/common/domain"
import type { MerchantAddressResponse } from "@shop/api/sdk"

/**
 * shop/address/address-form —— 商家地址表单的纯逻辑：入参校验、初值、字段清单。
 * 与组件同域但不碰 React：弹窗只负责渲染与编排，这些决定单独可测（对齐 web 的 address-form）。
 *
 * 号码/区划码/详址的口径与买家收货地址同源（@shop/common 的 address），两边差别只在必填项：
 * 商家这边联系人换名字、区级不再单列（省市区名一律由 regionCode 派生，见 queries.ts），
 * 外加邮编/公司名/备注这三个面单字段。
 */
export const AddressFormSchema = z.object({
    contactName: z
        .string()
        .trim()
        .min(1, "请输入联系人")
        .max(ADDRESS_NAME_MAX, `联系人最长 ${ADDRESS_NAME_MAX} 字`),
    phone: AddressPhoneSchema,
    regionCode: AddressRegionCodeSchema,
    detail: AddressDetailSchema,
    postalCode: z
        .string()
        .trim()
        .regex(new RegExp(`^\\d{${POSTAL_CODE_MAX}}$`), "邮编格式不正确")
        .optional()
        .or(z.literal("")),
    companyName: z
        .string()
        .trim()
        .max(COMPANY_NAME_MAX, `公司名称最长 ${COMPANY_NAME_MAX} 字`)
        .optional(),
    note: z.string().trim().max(NOTE_MAX, `备注最长 ${NOTE_MAX} 字`).optional(),
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
