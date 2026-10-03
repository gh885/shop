import { StaffStatus, UserStatus } from "@shop/api/sdk"
import { PermissionCodes } from "@shop/common/contract"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import { z } from "zod"

import type { AdminMessageKey } from "#/locales/messages.gen"

export const ACCOUNT_MANAGE_PERMISSION = PermissionCodes.STAFF_MANAGE

export const UserStatusSchema = z.enum(UserStatus)
export const StaffStatusSchema = z.enum(StaffStatus)

// 买家账号与平台员工的状态句子一模一样（正常 / 已禁用），就共用一套 key——一个概念只许有一个出口；
// 两份表分开是因为两个枚举类型不同，不是因为话不同。
type StatusKey = Extract<AdminMessageKey, `admin.account.status.${string}`>

export const USER_STATUS_META = {
    ACTIVE: { labelKey: "admin.account.status.ACTIVE", variant: "success" },
    DISABLED: { labelKey: "admin.account.status.DISABLED", variant: "destructive-subtle" },
} as const satisfies Record<
    UserStatus,
    { labelKey: StatusKey; variant: "success" | "destructive-subtle" }
>

export const STAFF_STATUS_META = {
    ACTIVE: { labelKey: "admin.account.status.ACTIVE", variant: "success" },
    DISABLED: { labelKey: "admin.account.status.DISABLED", variant: "destructive-subtle" },
} as const satisfies Record<
    StaffStatus,
    { labelKey: StatusKey; variant: "success" | "destructive-subtle" }
>

export const USER_STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<UserStatus, StatusKey>> =
    statusOptionsFromKeys(USER_STATUS_META)
export const STAFF_STATUS_OPTIONS: ReadonlyArray<KeyedStatusOption<StaffStatus, StatusKey>> =
    statusOptionsFromKeys(STAFF_STATUS_META)

export const STAFF_ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: "超级管理员",
    REVIEWER: "审核员",
    OPS: "运营",
}

/** 岗位下拉项（建员工/调岗位共用一份；描述是给人看的后果，不是权限码清单） */
export const STAFF_ROLE_ITEMS = [
    { value: "OPS", label: "运营", description: "内容、类目、物流轨迹、优惠券运营" },
    { value: "REVIEWER", label: "审核员", description: "入驻审核" },
    { value: "SUPER_ADMIN", label: "超级管理员", description: "全部权限，含员工管理" },
] as const
