import { PermissionCodes } from "@shop/common/contract"
import { statusOptions } from "@shop/common/domain" /** 审计查询入口的权限码：后端 `AUDIT_VIEW`（docs/conventions/permission-codes.md） */
export const AUDIT_VIEW_PERMISSION = PermissionCodes.AUDIT_VIEW

/**
 * 动作码 → 中文（与后端 `audit.api.AuditAction` 的 code 一一对应）。
 *
 * 前端只映射「给人看的名字」，不认识含义：新动作在后端加了码而这里没补时，
 * 表格退回显示码本身（而不是空白），运维一眼能看出是新动作。
 */
export const ACTION_LABEL: Record<string, string> = {
    "account.user.status_changed": "买家账号禁用/启用",
    "account.staff.status_changed": "员工账号禁用/启用",
    "account.staff.created": "创建员工",
    "account.staff.role_changed": "调整员工岗位",
    "coupon.user_coupon.voided": "优惠券作废",
    "shop.review.decided": "店铺审核决定",
    "shop.trading_suspended": "平台封店",
    "shop.trading_resumed": "平台解封",
    "logistics.shipment_issue.resolved": "物流异常处置",
    "logistics.tracking.written": "物流轨迹补录/纠错",
}

/** 目标类型码 → 中文（后端 `audit.api.AuditTargetType`） */
export const TARGET_LABEL: Record<string, string> = {
    USER: "买家账号",
    STAFF: "平台员工",
    USER_COUPON: "用户券",
    SHOP: "店铺",
    SHOP_REVIEW: "审核记录",
    SHIPMENT_ISSUE: "物流异常单",
    SHIPMENT: "物流包裹",
}

/**
 * 筛选入参的三个长度上限，与后端 `audit.dto.AuditFieldRules` 同值（GEN-56 第五边）：
 * URL 里的筛选值先过 zod，超长直接不出请求、不进 key。
 */
export const AUDIT_ACTION_MAX = 64
export const AUDIT_TARGET_ID_MAX = 64
export const AUDIT_TARGET_TYPE_MAX = 32

export const ACTION_OPTIONS = statusOptions(ACTION_LABEL)

export const TARGET_OPTIONS = statusOptions(TARGET_LABEL)

/**
 * 导出条数上限：一次导出最多把 1000 行拉下来拼 CSV。
 *
 * 再多就该走后端导出任务了——浏览器里拼十万行会把标签页卡死，而审计真正要导的
 * 通常是「某人某段时间」那一小段。超限时提示收窄筛选，而不是悄悄截断。
 */
export const EXPORT_ROW_LIMIT = 1000

/** 单页条数：审计是「按时间倒着翻」的列表，页大一点更贴近查账习惯 */
export const AUDIT_PAGE_SIZE = 20
