import { StaffStatus, UserStatus } from "@shop/api/sdk"
import { PermissionCodes, statusOptions } from "@shop/common"
import { z } from "zod"

export const ACCOUNT_MANAGE_PERMISSION = PermissionCodes.STAFF_MANAGE

export const UserStatusSchema = z.enum(UserStatus)
export const StaffStatusSchema = z.enum(StaffStatus)

export const USER_STATUS_META = {
    ACTIVE: { label: "正常", variant: "success" },
    DISABLED: { label: "已禁用", variant: "destructive-subtle" },
} as const satisfies Record<
    UserStatus,
    { label: string; variant: "success" | "destructive-subtle" }
>

export const STAFF_STATUS_META = {
    ACTIVE: { label: "正常", variant: "success" },
    DISABLED: { label: "已禁用", variant: "destructive-subtle" },
} as const satisfies Record<
    StaffStatus,
    { label: string; variant: "success" | "destructive-subtle" }
>

export const USER_STATUS_OPTIONS = statusOptions(USER_STATUS_META)
export const STAFF_STATUS_OPTIONS = statusOptions(STAFF_STATUS_META)

export const STAFF_ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: "超级管理员",
    REVIEWER: "审核员",
    OPS: "运营",
}
