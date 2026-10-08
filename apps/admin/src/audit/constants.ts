import { AdminAuditQuerySchema } from "@shop/api/schemas"
import { PermissionCodes } from "@shop/common/contract"
import { statusOptionsFromKeys, type KeyedStatusOption } from "@shop/common/domain"
import type { AdminMessageKey } from "#/locales/messages.gen"

/** 审计查询入口的权限码：后端 `AUDIT_VIEW`（docs/conventions/permission-codes.md） */
export const AUDIT_VIEW_PERMISSION = PermissionCodes.AUDIT_VIEW

type ActionKey = Extract<AdminMessageKey, `audit.action.${string}`>
type TargetKindKey = Extract<AdminMessageKey, `audit.target.${string}`>

/**
 * 动作码 → 文案 key（与后端 `audit.api.AuditAction` 的 code 一一对应）。
 *
 * 前端只映射「给人看的名字」，不认识含义：新动作在后端加了码而这里没补时，
 * 表格退回显示码本身（而不是空白），运维一眼能看出是新动作。句子在 catalog。
 */
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

/** 目标类型码 → 文案 key（后端 `audit.api.AuditTargetType`）；同样查不到退回码本身 */
export const TARGET_KEYS: Record<string, TargetKindKey> = {
    USER: "audit.target.USER",
    STAFF: "audit.target.STAFF",
    USER_COUPON: "audit.target.USER_COUPON",
    SHOP: "audit.target.SHOP",
    SHOP_REVIEW: "audit.target.SHOP_REVIEW",
    SHIPMENT_ISSUE: "audit.target.SHIPMENT_ISSUE",
    SHIPMENT: "audit.target.SHIPMENT",
}

/**
 * 筛选入参的三个长度上限，与后端 `audit.dto.AuditFieldRules` 同值（GEN-56 第五边）：
 * URL 里的筛选值先过 zod，超长直接不出请求、不进 key。
 */
export const AUDIT_ACTION_MAX = AdminAuditQuerySchema.properties.action.maxLength
export const AUDIT_TARGET_ID_MAX = AdminAuditQuerySchema.properties.targetId.maxLength
export const AUDIT_TARGET_TYPE_MAX = AdminAuditQuerySchema.properties.targetType.maxLength

export const ACTION_OPTIONS: ReadonlyArray<KeyedStatusOption<string, ActionKey>> =
    statusOptionsFromKeys(ACTION_KEYS)

export const TARGET_OPTIONS: ReadonlyArray<KeyedStatusOption<string, TargetKindKey>> =
    statusOptionsFromKeys(TARGET_KEYS)

/**
 * 导出条数上限：一次导出最多把 1000 行拉下来拼 CSV。
 *
 * 再多就该走后端导出任务了——浏览器里拼十万行会把标签页卡死，而审计真正要导的
 * 通常是「某人某段时间」那一小段。超限时提示收窄筛选，而不是悄悄截断。
 */
export const EXPORT_ROW_LIMIT = 1000

/** 单页条数：审计是「按时间倒着翻」的列表，页大一点更贴近查账习惯 */
export const AUDIT_PAGE_SIZE = 20
