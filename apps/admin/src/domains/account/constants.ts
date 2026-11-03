import { PermissionCodes } from "@shop/common/contract"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"

import type { AdminMessageKey } from "#/locales/messages.gen"

export const ACCOUNT_MANAGE_PERMISSION = PermissionCodes.PLATFORM_STAFF_WRITE

type StatusKey = Extract<AdminMessageKey, `account.status.${string}`>

/** 买家状态词表：后端 `UpdateBuyerStatusRequest.status` 的 pattern 是 `active|disabled` */
export const USER_STATUSES = ["active", "disabled"] as const
export type UserStatus = (typeof USER_STATUSES)[number]

/** 员工状态词表：后端 `staff.member.status` 落小写 */
export const STAFF_STATUSES = ["active", "disabled"] as const
export type StaffStatus = (typeof STAFF_STATUSES)[number]

export const USER_STATUS_META = {
    active: { labelKey: "account.status.ACTIVE", variant: "success" },
    disabled: { labelKey: "account.status.DISABLED", variant: "destructive-subtle" },
} as const satisfies Record<
    UserStatus,
    { labelKey: StatusKey; variant: "success" | "destructive-subtle" }
>

export const STAFF_STATUS_META = {
    active: { labelKey: "account.status.ACTIVE", variant: "success" },
    disabled: { labelKey: "account.status.DISABLED", variant: "destructive-subtle" },
} as const satisfies Record<
    StaffStatus,
    { labelKey: StatusKey; variant: "success" | "destructive-subtle" }
>

export const USER_STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<UserStatus, StatusKey>> =
    statusOptionsFromKeys(USER_STATUS_META)
export const STAFF_STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<StaffStatus, StatusKey>> =
    statusOptionsFromKeys(STAFF_STATUS_META)

/** 岗位词表：后端 `CreateStaffRequest.role` 是自由字符串，词表住在这张表里 */
export const STAFF_ROLES = ["SUPER_ADMIN", "REVIEWER", "OPS"] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const STAFF_ROLE_KEYS = {
    SUPER_ADMIN: "account.role.SUPER_ADMIN",
    REVIEWER: "account.role.REVIEWER",
    OPS: "account.role.OPS",
} as const satisfies Record<StaffRole, AdminMessageKey>

export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[StaffRole]

export const STAFF_ROLE_ITEMS: ReadonlyArray<{ value: StaffRole; labelKey: StaffRoleKey }> = [
    { value: "OPS", labelKey: "account.role.OPS" },
    { value: "REVIEWER", labelKey: "account.role.REVIEWER" },
    { value: "SUPER_ADMIN", labelKey: "account.role.SUPER_ADMIN" },
]
