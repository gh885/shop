/**
 * 权限码（前后端共同语言）前端侧唯一 owner：<b>本文件由 `scripts/contracts/permissions-codegen.mjs` 从
 * `contracts/permissions.yaml` 生成，不要手改。</b>与后端 `common.Permissions`（Java 那份）逐常量对应，
 * 两边相等由生成保证；「注册表 ⇄ 岗位授予 ⇄ 端点消费」由后端 `PermissionVocabularyTest` 核对。
 *
 * 值等于名字，不许改名（改名 = 契约破坏）。分 admin（平台员工岗位码）/ seller（店主可授予子账号的白名单）两域，
 * 收在同一处，是因为「这个字符串是什么意思」只有一个答案——各 app 自写字符串正是这条要防的。
 * 细则与文档表镜像见 docs/conventions/permission-codes.md。
 */
export const PermissionCodes = {
    // admin 域（平台员工，kind=staff）
    /**
     * 入驻审核（通过与拒绝），岗位 REVIEWER
     */
    SHOP_REVIEW: "SHOP_REVIEW",
    /**
     * CMS 内容维护（banner/导航/推荐位），岗位 OPS
     */
    CMS_MANAGE: "CMS_MANAGE",
    /**
     * 平台类目维护，岗位 OPS
     */
    CATEGORY_MANAGE: "CATEGORY_MANAGE",
    /**
     * 物流轨迹维护（补录节点、纠错），岗位 OPS
     */
    LOGISTICS_MANAGE: "LOGISTICS_MANAGE",
    /**
     * 平台优惠券运营（查询、作废），岗位 OPS
     */
    COUPON_OPS: "COUPON_OPS",
    /**
     * 操作审计查询（按操作人/对象/时间反查治理账本、导出），三个岗位都持有
     */
    AUDIT_VIEW: "AUDIT_VIEW",
    /**
     * 前端遥测排查（按影响会话数排序的问题聚合、事件明细与原件，含 userId/sessionId），岗位 OPS
     */
    RUM_VIEW: "RUM_VIEW",
    /**
     * 平台侧店铺治理（封店/解封），岗位 REVIEWER + OPS
     */
    SHOP_GOVERNANCE: "SHOP_GOVERNANCE",
    /**
     * 员工与岗位管理（创建员工、分配岗位、禁用），仅 SUPER_ADMIN。禁用半边已由 AdminAccountController 消费；创建/分配岗位仍 P2
     */
    STAFF_MANAGE: "STAFF_MANAGE",

    // seller 域（店铺子账号，店主可授予）
    /**
     * 商品增删改、规格 SKU、上下架
     */
    PRODUCT_MANAGE: "PRODUCT_MANAGE",
    /**
     * 卖家订单查看 + 发货
     */
    ORDER_FULFILL: "ORDER_FULFILL",
    /**
     * 店铺发货/退货/揽收地址管理（面单寄件人）
     */
    ADDRESS_MANAGE: "ADDRESS_MANAGE",
    /**
     * 运费模板（按收货地区与件数计费、不配送地区）
     */
    SHIPPING_MANAGE: "SHIPPING_MANAGE",
    /**
     * 店铺优惠券（建券、停券、名额查看）
     */
    COUPON_MANAGE: "COUPON_MANAGE",
} as const
