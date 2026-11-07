/**
 * 权限码。**本文件由 `scripts/contracts/permissions-codegen.mjs` 从 `contracts/permissions.yaml`
 * 生成，不要手改。** 跑 `pnpm permissions:gen` 重生成，`pnpm permissions:drift` 校验（pre-push 门禁）。
 *
 * 键是枚举名（大写），值是权限码（`resource:action`）。判权时比对的是**值**，键只是给人读的。
 *
 * **前端不需要"系统里有哪些权限"这份全集**——它需要的是 ① 当前用户的有效权限集（接口返回）
 * ② 一个联合类型（防拼错）。后者由本文件的 `PermissionCode` 提供。
 */
export const PermissionCodes = {
    /**
     * 读订单
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    ORDER_READ: "order:read",
    /**
     * 处理售后（拒绝、留言、举证，不动钱）
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    AFTER_SALE_CASE_HANDLE: "after_sale_case:handle",
    /**
     * 同意退款（动钱，受角色退款上限约束）
     *
     * @scope 授权的店集合
     * @risk high
     * @assignable 商家可转授给子账号
     */
    AFTER_SALE_CASE_REFUND: "after_sale_case:refund",
    /**
     * 读包裹与轨迹
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    PACKAGE_READ: "package:read",
    /**
     * 发货
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    PACKAGE_SHIP: "package:ship",
    /**
     * 人工补录物流轨迹
     *
     * @scope 授权的店集合
     * @risk high
     */
    PACKAGE_TRACK: "package:track",
    /**
     * 读商品
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    PRODUCT_READ: "product:read",
    /**
     * 商品建、改、上下架
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    PRODUCT_WRITE: "product:write",
    /**
     * 商品审核（通过 / 驳回）
     *
     * @scope 授权的店集合
     */
    PRODUCT_REVIEW: "product:review",
    /**
     * 读库存与库存流水
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    INVENTORY_READ: "inventory:read",
    /**
     * 调整可售库存
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    INVENTORY_ADJUST: "inventory:adjust",
    /**
     * 类目树的建、改、移动、归档
     *
     * @scope 无范围（平台级）
     */
    CATEGORY_CONFIGURE: "category:configure",
    /**
     * 品牌库的建、改、归档
     *
     * @scope 无范围（平台级）
     */
    BRAND_CONFIGURE: "brand:configure",
    /**
     * 改店铺资料（读自己店不判权，平台读店是 review 的一部分）
     *
     * @scope 本商家
     * @assignable 商家可转授给子账号
     */
    SHOP_UPDATE: "shop:update",
    /**
     * 关闭店铺（不可逆）
     *
     * @scope 本商家
     * @risk high
     */
    SHOP_CLOSE: "shop:close",
    /**
     * 入驻审核（通过 / 驳回）
     *
     * @scope 本商家
     */
    SHOP_REVIEW: "shop:review",
    /**
     * 暂停 / 恢复经营
     *
     * @scope 本商家
     * @risk high
     */
    SHOP_SUSPEND: "shop:suspend",
    /**
     * 管理子账号、角色与授权
     *
     * @scope 本商家
     * @risk high
     */
    MERCHANT_STAFF_WRITE: "merchant_staff:write",
    /**
     * 读结算单与账单（放款由平台或系统触发）
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    SETTLEMENT_READ: "settlement:read",
    /**
     * 运费模板的建、改、启用、归档
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    SHIPPING_TEMPLATE_CONFIGURE: "shipping_template:configure",
    /**
     * 建券、改券模板
     *
     * @scope 无范围（平台级）
     */
    COUPON_CONFIGURE: "coupon:configure",
    /**
     * 发放优惠券（立即产生负债）
     *
     * @scope 无范围（平台级）
     * @risk high
     */
    COUPON_ISSUE: "coupon:issue",
    /**
     * 建、改促销规则（草稿态）
     *
     * @scope 无范围（平台级）
     */
    PROMOTION_RULE_CONFIGURE: "promotion_rule:configure",
    /**
     * 上线 / 下线规则（改所有买家看到的价格）
     *
     * @scope 无范围（平台级）
     * @risk high
     */
    PROMOTION_RULE_ACTIVATE: "promotion_rule:activate",
    /**
     * 读广告位与投放数据
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    AD_READ: "ad:read",
    /**
     * 建、改广告投放
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    AD_WRITE: "ad:write",
    /**
     * 广告审核
     *
     * @scope 授权的店集合
     */
    AD_REVIEW: "ad:review",
    /**
     * 建、改、发布内容
     *
     * @scope 无范围（平台级）
     */
    CONTENT_ARTICLE_WRITE: "content_article:write",
    /**
     * 读店铺评价
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    REVIEW_READ: "review:read",
    /**
     * 回复评价（一次）
     *
     * @scope 授权的店集合
     * @assignable 商家可转授给子账号
     */
    REVIEW_REPLY: "review:reply",
    /**
     * 评价治理（隐藏 / 恢复）
     *
     * @scope 授权的店集合
     */
    REVIEW_MODERATE: "review:moderate",
    /**
     * 读违规线索
     *
     * @scope 无范围（平台级）
     */
    GOVERNANCE_CLUE_READ: "governance_clue:read",
    /**
     * 读买家资料
     *
     * @scope 无范围（平台级）
     */
    BUYER_ACCOUNT_READ: "buyer_account:read",
    /**
     * 封禁 / 解封买家
     *
     * @scope 无范围（平台级）
     * @risk high
     */
    BUYER_ACCOUNT_SUSPEND: "buyer_account:suspend",
    /**
     * 平台员工的建、调岗、禁用
     *
     * @scope 无范围（平台级）
     * @risk high
     */
    PLATFORM_STAFF_WRITE: "platform_staff:write",
    /**
     * 读挂账清单
     *
     * @scope 无范围（平台级）
     */
    SUSPENSE_READ: "suspense:read",
    /**
     * 挂账原路退款（动真钱）
     *
     * @scope 无范围（平台级）
     * @risk high
     */
    SUSPENSE_REFUND: "suspense:refund",
    /**
     * 驳回挂账
     *
     * @scope 无范围（平台级）
     */
    SUSPENSE_REJECT: "suspense:reject",
    /**
     * 读对账结果与资金结构
     *
     * @scope 无范围（平台级）
     */
    RECONCILIATION_STATEMENT_READ: "reconciliation_statement:read",
    /**
     * 手动触发定时任务
     *
     * @scope 无范围（平台级）
     */
    JOB_TRIGGER: "job:trigger",
    /**
     * 读未完成的事件登记
     *
     * @scope 无范围（平台级）
     */
    EVENT_RECORD_READ: "event_record:read",
    /**
     * 事件重放（让已被判死的事件重新生效）
     *
     * @scope 无范围（平台级）
     * @risk high
     */
    EVENT_RECORD_REPLAY: "event_record:replay",
    /**
     * 读审计日志
     *
     * @scope 无范围（平台级）
     */
    AUDIT_LOG_READ: "audit_log:read",
    /**
     * 读 RUM 采集与告警面板
     *
     * @scope 无范围（平台级）
     */
    RUM_REPORT_READ: "rum_report:read",
} as const

export type PermissionCode = (typeof PermissionCodes)[keyof typeof PermissionCodes]
