import { StaffStatus, UserStatus } from "@shop/api/sdk"
import { PermissionCodes } from "@shop/common/contract"
import { statusOptions } from "@shop/common/domain"
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

/** 岗位下拉项（建员工/调岗位共用一份；描述是给人看的后果，不是权限码清单） */
export const STAFF_ROLE_ITEMS = [
    { value: "OPS", label: "运营", description: "内容、类目、物流轨迹、优惠券运营" },
    { value: "REVIEWER", label: "审核员", description: "入驻审核" },
    { value: "SUPER_ADMIN", label: "超级管理员", description: "全部权限，含员工管理" },
] as const
