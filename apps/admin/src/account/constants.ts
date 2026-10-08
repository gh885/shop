import { StaffRole, StaffStatus, UserStatus } from "@shop/api/sdk"
import { PermissionCodes } from "@shop/common/contract"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"

import type { AdminMessageKey } from "#/locales/messages.gen"

export const ACCOUNT_MANAGE_PERMISSION = PermissionCodes.STAFF_MANAGE

// 买家账号与平台员工的状态句子一模一样（正常 / 已禁用），就共用一套 key——一个概念只许有一个出口；
// 两份表分开是因为两个枚举类型不同，不是因为话不同。
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

/**
 * 岗位 → 文案 key。
 *
 * 表本身 `as const satisfies` 就把「三个岗位一个都不许漏、key 必须真实存在」钉在编译期；
 * key 的类型从这张表反推，而不是 `Extract<…, "account.role.${string}">`——那个前缀还罩着
 * `role.summary` 这类**带参数**的消息，用它做 `t(key)` 会因为「缺参数」编译不过。
 *
 * 出参 `role` 是宽松的 `string`（后端对库里的陌生档位照实给值），所以读侧不能只认这张表：
 * 查不到要退回原码，见 `staff-form.ts` 的 `staffRoleLabel`——它是唯一一处判定。
 */
export const STAFF_ROLE_KEYS = {
    SUPER_ADMIN: "account.role.SUPER_ADMIN",
    REVIEWER: "account.role.REVIEWER",
    OPS: "account.role.OPS",
} as const satisfies Record<StaffRole, AdminMessageKey>

/** 岗位名的 catalog key（SUPER_ADMIN / REVIEWER / OPS 三个字面量） */
export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[StaffRole]

/** 岗位下拉项（建员工/调岗位共用一份）：只给码与 key，句子在渲染边界按当前语言换 */
export const STAFF_ROLE_ITEMS: ReadonlyArray<{ value: StaffRole; labelKey: StaffRoleKey }> = [
    { value: StaffRole.OPS, labelKey: "account.role.OPS" },
    { value: StaffRole.REVIEWER, labelKey: "account.role.REVIEWER" },
    { value: StaffRole.SUPER_ADMIN, labelKey: "account.role.SUPER_ADMIN" },
]
