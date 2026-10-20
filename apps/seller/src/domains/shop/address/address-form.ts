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
    POSTAL_CODE_PATTERN,
    regionCodeSchema,
    withMaxLength,
} from "@shop/common/domain"
import type { MerchantAddressResponse } from "@shop/api/sdk"

import { messageFactFactory } from "@shop/i18n"

import type { SellerMessageKey, SellerParamsByKey } from "#/locales/messages.gen"

type ShopErrKey = Extract<SellerMessageKey, `shop.err.${string}`>
const err = messageFactFactory<ShopErrKey, SellerParamsByKey>()

type AddressFieldKey = Extract<SellerMessageKey, `shop.address.form.${string}`>

export const AddressFormSchema = z.object({
    contactName: withMaxLength(
        z.string().trim().min(1, { message: VALIDATION_RULES.REQUIRED }),
        ADDRESS_NAME_MAX,
    ),
    phone: AddressPhoneSchema,
    regionCode: regionCodeSchema(err("shop.err.regionRequired")),
    detail: AddressDetailSchema,
    postalCode: z
        .string()
        .trim()
        .regex(POSTAL_CODE_PATTERN, { message: VALIDATION_RULES.PATTERN })
        .optional()
        .or(z.literal("")),
    companyName: withMaxLength(z.string().trim(), COMPANY_NAME_MAX).optional(),
    note: withMaxLength(z.string().trim(), NOTE_MAX).optional(),
    defaultShip: z.boolean(),
    defaultReturn: z.boolean(),
})

export type AddressFormValues = z.infer<typeof AddressFormSchema>

export const CONTACT_FIELDS = [
    {
        name: "contactName",
        labelKey: "shop.address.form.contactName.label",
        placeholderKey: "shop.address.form.contactName.placeholder",
        maxLength: ADDRESS_NAME_MAX,
    },
    {
        name: "phone",
        labelKey: "shop.address.form.phone.label",
        placeholderKey: "shop.address.form.phone.placeholder",
        maxLength: CONTACT_PHONE_MAX,
        inputMode: "tel",
    },
] as const satisfies readonly {
    name: string
    labelKey: AddressFieldKey
    placeholderKey: AddressFieldKey
    maxLength: number
    inputMode?: string
}[]

export const ADDRESS_FIELDS = [
    {
        name: "detail",
        labelKey: "shop.address.form.detail.label",
        placeholderKey: "shop.address.form.detail.placeholder",
        maxLength: ADDRESS_DETAIL_MAX,
        required: true,
    },
    {
        name: "postalCode",
        labelKey: "shop.address.form.postalCode.label",
        placeholderKey: "shop.address.form.postalCode.placeholder",
        maxLength: POSTAL_CODE_MAX,
    },
    {
        name: "companyName",
        labelKey: "shop.address.form.companyName.label",
        placeholderKey: "shop.address.form.companyName.placeholder",
        maxLength: COMPANY_NAME_MAX,
    },
    {
        name: "note",
        labelKey: "shop.address.form.note.label",
        placeholderKey: "shop.address.form.note.placeholder",
        maxLength: NOTE_MAX,
    },
] as const satisfies readonly {
    name: string
    labelKey: AddressFieldKey
    placeholderKey: AddressFieldKey
    maxLength: number
    required?: boolean
}[]

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
