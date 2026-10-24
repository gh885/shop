package com.shop.platform.infra.security;

/**
 * 全局权限点。清单驱动——这份枚举和 {@code common.permission} 表在启动时做双向比对，
 * 少一个多一个应用都起不来。
 *
 * <p>为什么不用字符串常量散落在各处：拼错一个字母不会报错，只会让那项权限永远为假，
 * 或者永远为真。这类 bug 只有在出事时才会被发现。
 */
public enum Permission {
    // —— 卖家域 ——
    ORDER_READ("order:read"),
    ORDER_REFUND("order:refund"),
    PRODUCT_READ("product:read"),
    PRODUCT_WRITE("product:write"),
    SHOP_READ("shop:read"),
    STAFF_MANAGE("staff:manage"),
    FINANCE_READ("finance:read"),
    SETTLEMENT_APPROVE("settlement:approve"),
    /**
     * 运费模板的建、改、启用、归档。
     *
     * <p>不并进 {@code product:write}：商品编辑和"改买家要付多少运费"是两种爆炸半径。
     * 一个只该上架商品的运营，不该顺手把包邮门槛从 99 改成 199。
     */
    SHIPPING_MANAGE("shipping:manage"),

    // —— 平台域 ——
    // 这 14 个由 staff 身份持有，与卖家侧的 9 个互不重叠：一个平台运营不该有"编辑某个商家的商品"的权限，
    // 一个卖家也不该有"审核入驻"的权限。共用同一张 common.permission 表，是因为它是权限点的总清单，
    // 不是"卖家权限表"——Authorizer 启动时拿整张表和本枚举双向比对。
    SHOP_REVIEW("SHOP_REVIEW"),
    SHOP_GOVERNANCE("SHOP_GOVERNANCE"),
    CATEGORY_MANAGE("CATEGORY_MANAGE"),
    PRODUCT_REVIEW("PRODUCT_REVIEW"),
    CMS_MANAGE("CMS_MANAGE"),
    /**
     * 人工补录物流轨迹（/api/admin/logistics/traces）。
     *
     * <p>能推进包裹到"已签收"并触发订单完成与结算解冻，和承运商推送口同等危险；
     * 员工身份就是签名，不再叠加渠道密钥。
     */
    LOGISTICS_MANAGE("LOGISTICS_MANAGE"),
    COUPON_OPS("COUPON_OPS"),
    /**
     * 平台促销规则的配置与上下线。
     *
     * <p>和 {@code COUPON_OPS} 分开：券是发给某一个人的，满减是改所有人看到的价格。
     * 能发券的人不一定该能改价，所以权限点不合并。
     */
    PROMOTION_MANAGE("PROMOTION_MANAGE"),
    /**
     * 查看对账结果。
     *
     * <p>只授 SUPER_ADMIN：报告会把"哪些账户余额对不上"整页摊开，那是全平台的资金结构。
     * 等财务岗建起来，把授权改成那个岗位即可，权限点本身不用动。
     */
    LEDGER_VIEW("LEDGER_VIEW"),
    AUDIT_VIEW("AUDIT_VIEW"),
    /**
     * 手动触发定时任务（事件补发 / 对账 / 各类清理 / 超时关单等）。
     *
     * <p>授 OPS：它是运维动作不是业务操作，能点这个按钮的应该正是盯着
     * {@code shop.job.*} 指标的人。触发与定时调度走同一条路径，锁与幂等不变。
     */
    JOB_TRIGGER("JOB_TRIGGER"),
    /**
     * 挂账待查的清单、手动退款与驳回——"钱到了但推进不了"的统一出口。
     *
     * <p>只授 SUPER_ADMIN：这是动真钱的出口。挂账行里躺着迟到回调的真金白银，
     * 能点退款的人应该正是看得懂 payment / clearing 两边状态的人。
     */
    SUSPENSE_MANAGE("SUSPENSE_MANAGE"),
    /**
     * 事件重放：查看未完成的事件登记、把重投次数超限的单条事件清零放行。
     *
     * <p>不并进 {@code JOB_TRIGGER}：触发任务是"让既定流程立刻跑一轮"，重放是"让一条
     * 已被判死的事件重新生效"，后者直接改写业务后果。放行前必须先查清失败根因——
     * 重放的安全性由消费端去重（EventInbox）和业务 CAS 保证，重复投递不会重复推进。
     */
    EVENT_REPLAY("EVENT_REPLAY"),
    /**
     * 查看违规线索（履约超时等）。只读——处置（扣分/限流）还没做，先让人看见。
     *
     * <p>授 OPS：线索是检测任务自动报上来的告警面，盯 {@code shop.job.*} 的人
     * 正是该盯这张清单的人。
     */
    TRUST_REVIEW("TRUST_REVIEW"),
    RUM_VIEW("RUM_VIEW");

    private final String code;

    Permission(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }
}
