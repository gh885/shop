/**
 * 权限码（前后端共同语言）前端侧唯一 owner：<b>本文件由 `scripts/contracts/permissions-codegen.mjs` 从
 * `contracts/permissions.yaml` 生成，不要手改。</b>跑 `pnpm permissions:gen` 重生成，
 * `pnpm permissions:drift` 校验生成物与 yaml 一致（pre-push 门禁）。
 *
 * 值等于名字，不许改名（改名 = 契约破坏）。分 admin（平台员工岗位码）/ seller（店铺账号权限码；high 码主账号专属，不进子账号可授予清单）两域，
 * 收在同一处，是因为"这个字符串是什么意思"只有一个答案——各 app 自写字符串正是这条要防的。
 *
 * 后端那份（`infra.security.Permission` 枚举）不生成：它带注释和分组论证，生成器产出不了。
 * 两份相等由后端 `PermissionVocabularyTest` 与本 yaml 三方对拍保证。
 *
 * **这里没有的码就是库里没有的码。** `reserved: true` 的条目（ADDRESS_MANAGE / COUPON_MANAGE / MEMBER_MANAGE / SHOP_MANAGE）
 * 只活在文档里，不生成——一个永远为假的常量会让"这个人有权限吗"多出第三种答案。
 */
export const PermissionCodes = {
    // —— admin 域（平台员工岗位码） ——
    /**
     * 入驻审核（通过与拒绝）。与 SHOP_GOVERNANCE 分开：一个决定"能不能开业"，一个决定"开业后要不要停业"
     *
     * <p>授予：REVIEWER / SUPER_ADMIN
     */
    SHOP_REVIEW: "SHOP_REVIEW",
    /**
     * 平台侧店铺治理（封店 / 解封）。和 SHOP_REVIEW 分开：审核是一次性准入判断，治理是持续的处置权
     *
     * <p>授予：REVIEWER / OPS / SUPER_ADMIN
     */
    SHOP_GOVERNANCE: "SHOP_GOVERNANCE",
    /**
     * 平台类目与属性模板维护。与 PRODUCT_REVIEW 分开：这个点定"格子要填什么"，那个点判"这条商品合不合规"——合成一个就是自己出题自己批卷
     *
     * <p>授予：OPS / SUPER_ADMIN
     */
    CATEGORY_MANAGE: "CATEGORY_MANAGE",
    /**
     * 商品审核（通过 / 驳回 / 下架）
     *
     * <p>授予：REVIEWER / SUPER_ADMIN
     */
    PRODUCT_REVIEW: "PRODUCT_REVIEW",
    /**
     * CMS 内容维护（banner / 导航 / 推荐位）
     *
     * <p>授予：OPS / SUPER_ADMIN
     */
    CMS_MANAGE: "CMS_MANAGE",
    /**
     * 物流轨迹维护（补录节点、纠错）。能推进包裹到已签收并触发结算解冻，与承运商推送口同等危险
     *
     * <p>授予：OPS / SUPER_ADMIN
     */
    LOGISTICS_MANAGE: "LOGISTICS_MANAGE",
    /**
     * 平台优惠券运营（查询、作废）。与 PROMOTION_MANAGE 分开：券发给某个人，满减改所有人的价
     *
     * <p>授予：OPS / SUPER_ADMIN
     */
    COUPON_OPS: "COUPON_OPS",
    /**
     * 平台促销规则（满减、折扣的配置与上下线）
     *
     * <p>授予：OPS / SUPER_ADMIN
     */
    PROMOTION_MANAGE: "PROMOTION_MANAGE",
    /**
     * 查看对账结果（差异项与余额重算）。报告摊开全平台账户的余额结构，不是运营日常要看的东西。risk_level=high
     *
     * <p>授予：SUPER_ADMIN
     */
    LEDGER_VIEW: "LEDGER_VIEW",
    /**
     * 操作审计查询（按操作人 / 对象 / 时间反查治理账本、导出）。三个岗位都持有：审计是底线，不是特权
     *
     * <p>授予：REVIEWER / OPS / SUPER_ADMIN
     */
    AUDIT_VIEW: "AUDIT_VIEW",
    /**
     * 平台员工与岗位管理（创建员工、分配岗位、禁用）。只管员工，不管买家——封买家是 BUYER_MANAGE
     *
     * <p>授予：SUPER_ADMIN
     */
    STAFF_MANAGE: "STAFF_MANAGE",
    /**
     * 买家账号封禁与解封。与 STAFF_MANAGE 分开，尽管两者都是"封人"：员工几十个，买家是全平台，爆炸半径差三个数量级
     *
     * <p>授予：SUPER_ADMIN
     */
    BUYER_MANAGE: "BUYER_MANAGE",
    /**
     * 手动触发定时任务（补发 / 对账 / 清理 / 超时关单）。运维动作不是业务操作，授盯着 shop.job.* 指标的人
     *
     * <p>授予：OPS / SUPER_ADMIN
     */
    JOB_TRIGGER: "JOB_TRIGGER",
    /**
     * 事件重放：未完成事件清单 / 超限事件放行。不并进 JOB_TRIGGER：触发任务是"让既定流程跑一轮"，重放是"让一条已被判死的事件重新生效"
     *
     * <p>授予：OPS / SUPER_ADMIN
     */
    EVENT_REPLAY: "EVENT_REPLAY",
    /**
     * 挂账待查清单、手动退款与驳回——"钱到了但推进不了"的统一出口。risk_level=high
     *
     * <p>授予：SUPER_ADMIN
     */
    SUSPENSE_MANAGE: "SUSPENSE_MANAGE",
    /**
     * 查看违规线索（履约超时等）。只读——处置（扣分 / 限流）还没做，先让人看见
     *
     * <p>授予：OPS / SUPER_ADMIN
     */
    GOVERNANCE_REVIEW: "GOVERNANCE_REVIEW",
    /**
     * 前端遥测排查（按影响会话数排序的问题聚合、事件明细与原件，含 userId / sessionId）
     *
     * <p>授予：OPS / SUPER_ADMIN
     */
    RUM_VIEW: "RUM_VIEW",

    // —— seller 域（店铺账号；risk_level=high 的点主账号专属） ——
    /**
     * 商品增删改、规格 SKU、提交挂售。平台侧审核是 PRODUCT_REVIEW，两者不共用
     *
     * <p>授予：owner
     */
    PRODUCT_WRITE: "PRODUCT_WRITE",
    /**
     * 查看本商家商品（含草稿与被驳回的）。商品库按商家共享、不按店拆——SPU 归商家，店铺只是挂售窗口
     *
     * <p>授予：owner
     */
    PRODUCT_READ: "PRODUCT_READ",
    /**
     * 查看订单与发货状态。范围按账号的店铺授权收窄（主账号 = 全部店铺含已关店，子账号 = 授权店），不是固定一个店
     *
     * <p>授予：owner
     */
    ORDER_READ: "ORDER_READ",
    /**
     * 处理商家售后（拒绝 / 留言 / 举证），不动钱，可授予子账号。与 ORDER_REFUND_APPROVE 拆开：客服要能处理纠纷，但不能动钱
     *
     * <p>授予：owner
     */
    ORDER_REFUND: "ORDER_REFUND",
    /**
     * 同意退款 / 确认退款。risk_level=high：动钱出口，主账号专属，不进子账号可授予清单——拒绝不改变任何人的余额，「同意」改变
     *
     * <p>授予：owner
     */
    ORDER_REFUND_APPROVE: "ORDER_REFUND_APPROVE",
    /**
     * 查看店铺经营数据（销量、结算概览）
     *
     * <p>授予：owner
     */
    SHOP_READ: "SHOP_READ",
    /**
     * 运费模板（按收货地区与件数计费、不配送地区）。不并进 PRODUCT_WRITE：改买家要付多少运费和上架商品是两种爆炸半径
     *
     * <p>授予：owner
     */
    SHIPPING_MANAGE: "SHIPPING_MANAGE",
    /**
     * 查看本店资金流水与结算单
     *
     * <p>授予：owner
     */
    FINANCE_READ: "FINANCE_READ",
    /**
     * 管理本店子账号与角色。与平台侧 STAFF_MANAGE 分开：一个是店主管自己的客服，一个是平台管员工，两套身份域不共用码
     *
     * <p>授予：owner
     */
    SELLER_STAFF_MANAGE: "SELLER_STAFF_MANAGE",
    /**
     * 审批结算单（商家侧确认批次金额）。risk_level=high：动钱出口
     *
     * <p>授予：owner
     */
    SETTLEMENT_APPROVE: "SETTLEMENT_APPROVE",
} as const

export type PermissionCode = (typeof PermissionCodes)[keyof typeof PermissionCodes]
