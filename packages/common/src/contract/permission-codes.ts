/**
 * 权限码（前后端共同语言）前端侧唯一 owner，与后端 `common.Permissions` 及
 * docs/conventions/permission-codes.md 对齐。**值等于名字**，不许改名（改名 = 契约破坏）。
 *
 * 分两域：`admin` 是平台员工的岗位码（apps/admin 消费），`seller` 是店主能授予店铺子账号的
 * 白名单（apps/seller 消费，后端 owner 是 `ShopService` 的可授予集合）。两域都收在这一处，
 * 是因为「这个字符串是什么意思」只有一个答案——各 app 自写字符串正是这条要防的。
 */
export const PermissionCodes = {
    // admin 域（平台员工，kind=staff）
    STAFF_MANAGE: "STAFF_MANAGE",
    COUPON_OPS: "COUPON_OPS",
    AUDIT_VIEW: "AUDIT_VIEW",
    SHOP_GOVERNANCE: "SHOP_GOVERNANCE",
    LOGISTICS_MANAGE: "LOGISTICS_MANAGE",

    // seller 域（店铺子账号，店主可授予）
    PRODUCT_MANAGE: "PRODUCT_MANAGE",
    ORDER_FULFILL: "ORDER_FULFILL",
    ADDRESS_MANAGE: "ADDRESS_MANAGE",
    SHIPPING_MANAGE: "SHIPPING_MANAGE",
    COUPON_MANAGE: "COUPON_MANAGE",
} as const
