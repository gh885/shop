import { CreateStaffRequestSchema } from "@shop/api/schemas"
import { StaffRole } from "@shop/api/sdk"
import { PASSWORD_MIN } from "@shop/app-kit/auth"
import { withMaxLength, withMinLength } from "@shop/common/domain"
import { z } from "zod"

import { messageFactFactory } from "@shop/i18n"

import type { AdminMessageKey, AdminParamsByKey } from "#/locales/messages.gen"

import { STAFF_ROLE_KEYS, type StaffRoleKey } from "./constants"

export const EMPLOYEE_NO_MAX = CreateStaffRequestSchema.properties.employeeNo.maxLength

export const EMPLOYEE_NO_PATTERN = new RegExp(
    CreateStaffRequestSchema.properties.employeeNo.pattern,
)

export const DISPLAY_NAME_MAX = CreateStaffRequestSchema.properties.displayName.maxLength

const PASSWORD_MAX = CreateStaffRequestSchema.properties.password.maxLength

const StaffRoleSchema = z.enum(StaffRole)

type StaffErrKey = Extract<AdminMessageKey, `account.form.err.${string}`>
const err = messageFactFactory<StaffErrKey, AdminParamsByKey>()

export const CreateStaffSchema = z.object({
    employeeNo: withMaxLength(
        z
            .string()
            .trim()
            .min(1, err("account.form.err.employeeNoRequired"))
            .regex(EMPLOYEE_NO_PATTERN, err("account.form.err.employeeNoPattern")),
        EMPLOYEE_NO_MAX,
    ),
    password: withMaxLength(withMinLength(z.string(), PASSWORD_MIN), PASSWORD_MAX),
    displayName: withMaxLength(z.string().trim(), DISPLAY_NAME_MAX),
    role: StaffRoleSchema,
})

export type CreateStaffValue = z.infer<typeof CreateStaffSchema>

const STAFF_ROLE_VALUES: readonly string[] = Object.values(StaffRole)
const isStaffRole = (value: string): value is StaffRole => STAFF_ROLE_VALUES.includes(value)

export function staffRoleOf(value: string | null | undefined): StaffRole | undefined {
    return value && isStaffRole(value) ? value : undefined
}

export function staffRoleLabel(
    value: string | null | undefined,
    t: (key: StaffRoleKey) => string,
): string {
    if (!value) return "—"
    const role = staffRoleOf(value)
    return role ? t(STAFF_ROLE_KEYS[role]) : value
}
