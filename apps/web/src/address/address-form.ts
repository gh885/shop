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

import { messageFactFactory } from "@shop/i18n"

import type { WebMessageKey, WebParamsByKey } from "#/locales/messages.gen"

import { isBuiltinLabel, type Address, type AddressInput } from "./rules"

type WebErrKey = Extract<WebMessageKey, `address.err.${string}`>
const err = messageFactFactory<WebErrKey, WebParamsByKey>()

export const AddressInputSchema = z.object({
    receiver: withMaxLength(
        z.string().trim().min(1, { message: VALIDATION_RULES.REQUIRED }),
        ADDRESS_NAME_MAX,
    ),
    phone: AddressPhoneSchema,
    regionCode: regionCodeSchema(err("address.err.regionRequired")),
    detail: AddressDetailSchema,
    label: withMaxLength(z.string(), ADDRESS_LABEL_MAX).optional(),
    isDefault: z.boolean().optional(),
})

export const CUSTOM_LABEL_MAX = 4

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

export { isBuiltinLabel } from "./rules"

export function isCustomLabel(value?: string): boolean {
    return value !== undefined && value !== "" && !isBuiltinLabel(value)
}
