import { StaffRole, StaffStatus, UserStatus } from "@shop/api/sdk"
import { PermissionCodes } from "@shop/common/contract"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"

import type { AdminMessageKey } from "#/locales/messages.gen"

export const ACCOUNT_MANAGE_PERMISSION = PermissionCodes.STAFF_MANAGE

type StatusKey = Extract<AdminMessageKey, `account.status.${string}`>

export const USER_STATUS_META = {
    ACTIVE: { labelKey: "account.status.ACTIVE", variant: "success" },
    DISABLED: { labelKey: "account.status.DISABLED", variant: "destructive-subtle" },
} as const satisfies Record<
    UserStatus,
    { labelKey: StatusKey; variant: "success" | "destructive-subtle" }
>

export const STAFF_STATUS_META = {
    ACTIVE: { labelKey: "account.status.ACTIVE", variant: "success" },
    DISABLED: { labelKey: "account.status.DISABLED", variant: "destructive-subtle" },
} as const satisfies Record<
    StaffStatus,
    { labelKey: StatusKey; variant: "success" | "destructive-subtle" }
>

export const USER_STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<UserStatus, StatusKey>> =
    statusOptionsFromKeys(USER_STATUS_META)
export const STAFF_STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<StaffStatus, StatusKey>> =
    statusOptionsFromKeys(STAFF_STATUS_META)

export const STAFF_ROLE_KEYS = {
    SUPER_ADMIN: "account.role.SUPER_ADMIN",
    REVIEWER: "account.role.REVIEWER",
    OPS: "account.role.OPS",
} as const satisfies Record<StaffRole, AdminMessageKey>

export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[StaffRole]

export const STAFF_ROLE_ITEMS: ReadonlyArray<{ value: StaffRole; labelKey: StaffRoleKey }> = [
    { value: StaffRole.OPS, labelKey: "account.role.OPS" },
    { value: StaffRole.REVIEWER, labelKey: "account.role.REVIEWER" },
    { value: StaffRole.SUPER_ADMIN, labelKey: "account.role.SUPER_ADMIN" },
]
