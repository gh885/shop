/** 与后端 common.Permissions 及 docs/conventions/permission-codes.md 对齐的前端唯一 owner。 */
export const PermissionCodes = {
    STAFF_MANAGE: "STAFF_MANAGE",
    COUPON_OPS: "COUPON_OPS",
    AUDIT_VIEW: "AUDIT_VIEW",
    SHOP_GOVERNANCE: "SHOP_GOVERNANCE",
    LOGISTICS_MANAGE: "LOGISTICS_MANAGE",
} as const
