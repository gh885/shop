import { CreateStaffRequestSchema } from "@shop/api/schemas"
import { PASSWORD_MIN } from "@shop/app-kit/auth"
import { withMaxLength, withMinLength } from "@shop/common/domain"
import { z } from "zod"

import { messageFactFactory } from "@shop/i18n"

import type { AdminMessageKey, AdminParamsByKey } from "#/locales/messages.gen"

import { STAFF_ROLE_KEYS, STAFF_ROLES, type StaffRole, type StaffRoleKey } from "./constants"

/** 登录名：契约那格（`loginName`）是 4..32 位、字母数字与 `_.-` */
export const LOGIN_NAME_MAX = CreateStaffRequestSchema.properties.loginName.maxLength
export const LOGIN_NAME_MIN = CreateStaffRequestSchema.properties.loginName.minLength
export const LOGIN_NAME_PATTERN = new RegExp(CreateStaffRequestSchema.properties.loginName.pattern)

export const DISPLAY_NAME_MAX = CreateStaffRequestSchema.properties.displayName.maxLength

const PASSWORD_MAX = CreateStaffRequestSchema.properties.password.maxLength

const StaffRoleSchema = z.enum(STAFF_ROLES)

type StaffErrKey = Extract<AdminMessageKey, `account.form.err.${string}`>
const err = messageFactFactory<StaffErrKey, AdminParamsByKey>()

export const CreateStaffSchema = z.object({
    loginName: withMaxLength(
        z
            .string()
            .trim()
            .min(LOGIN_NAME_MIN, err("account.form.err.employeeNoRequired"))
            .regex(LOGIN_NAME_PATTERN, err("account.form.err.employeeNoPattern")),
        LOGIN_NAME_MAX,
    ),
    password: withMaxLength(withMinLength(z.string(), PASSWORD_MIN), PASSWORD_MAX),
    displayName: withMaxLength(z.string().trim(), DISPLAY_NAME_MAX),
    role: StaffRoleSchema,
})

export type CreateStaffValue = z.infer<typeof CreateStaffSchema>

const STAFF_ROLE_VALUES: readonly string[] = STAFF_ROLES
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
