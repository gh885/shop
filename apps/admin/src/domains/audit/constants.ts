import { AdminAuditQuerySchema } from "@shop/api/schemas"
import { PermissionCodes } from "@shop/common/contract"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type { AdminMessageKey } from "#/locales/messages.gen"

export const AUDIT_VIEW_PERMISSION = PermissionCodes.AUDIT_VIEW

type ActionKey = Extract<AdminMessageKey, `audit.action.${string}`>
type TargetKindKey = Extract<AdminMessageKey, `audit.target.${string}`>

export const ACTION_KEYS: Record<string, ActionKey> = {
    "account.user.status_changed": "audit.action.account.user.status_changed",
    "account.staff.status_changed": "audit.action.account.staff.status_changed",
    "account.staff.created": "audit.action.account.staff.created",
    "account.staff.role_changed": "audit.action.account.staff.role_changed",
    "coupon.user_coupon.voided": "audit.action.coupon.user_coupon.voided",
    "shop.review.decided": "audit.action.shop.review.decided",
    "shop.trading_suspended": "audit.action.shop.trading_suspended",
    "shop.trading_resumed": "audit.action.shop.trading_resumed",
    "logistics.shipment_issue.resolved": "audit.action.logistics.shipment_issue.resolved",
    "logistics.tracking.written": "audit.action.logistics.tracking.written",
}

export const TARGET_KEYS: Record<string, TargetKindKey> = {
    USER: "audit.target.USER",
    STAFF: "audit.target.STAFF",
    USER_COUPON: "audit.target.USER_COUPON",
    SHOP: "audit.target.SHOP",
    SHOP_REVIEW: "audit.target.SHOP_REVIEW",
    SHIPMENT_ISSUE: "audit.target.SHIPMENT_ISSUE",
    SHIPMENT: "audit.target.SHIPMENT",
}

// 从生成物读 maxLength 而不是写死数字：后端改上限时这里跟着变，写死会悄悄漂移
export const AUDIT_ACTION_MAX = AdminAuditQuerySchema.properties.action.maxLength
export const AUDIT_TARGET_ID_MAX = AdminAuditQuerySchema.properties.targetId.maxLength
export const AUDIT_TARGET_TYPE_MAX = AdminAuditQuerySchema.properties.targetType.maxLength

export const ACTION_OPTIONS: ReadonlyArray<KeyedStatusOption<string, ActionKey>> =
    statusOptionsFromKeys(ACTION_KEYS)

export const TARGET_OPTIONS: ReadonlyArray<KeyedStatusOption<string, TargetKindKey>> =
    statusOptionsFromKeys(TARGET_KEYS)

// 导出超限时提示收窄筛选，别悄悄截断丢行（数据丢失）：再多就该走后端导出任务，浏览器里拼十万行会卡死标签页
export const EXPORT_ROW_LIMIT = 1000

export const AUDIT_PAGE_SIZE = 20
