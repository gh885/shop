package com.shop.platform.coupon.model;

/**
 * 用户券状态机 —— 一张券从领到手到终态的取值。
 *
 * <pre>
 * UNUSED ──下单占用──> LOCKED ──支付成功──> USED
 *    │                    │
 *    │                    └──取消 / 超时关单──> UNUSED（释放）
 *    └──时间到──> EXPIRED
 * UNUSED / LOCKED ──运营作废──> VOID
 * </pre>
 *
 * <p><b>LOCKED 不可省</b>：下单到支付完成之间隔着待付款超时窗口，不占用的话同一张券能被两个未付款订单同时用掉。
 * <p><b>USED 不可逆</b>：退款不把 USED 改回 UNUSED，而是另发一张新券（coupon.md §7）——否则核销流水断链，
 * 也算不清「这张券到底被用过几次」。
 * <p>持有订单的单据由 {@code order_id} 列承载，状态与它的自洽由 DB 的 ck_user_coupons_order_ref 强制。
 */
public enum UserCouponStatus {

    /** 未使用（含已释放回可用的）：唯一可作为结算候选的状态 */
    UNUSED,

    /** 已占用：下单未付款期间锁着，防同一张券被多笔未付款订单同时用掉 */
    LOCKED,

    /** 已核销：支付成功，不可逆 */
    USED,

    /** 已过期：由过期收敛任务刷出（读时判定以 expire_at 为准，状态只服务于展示与统计） */
    EXPIRED,

    /** 已作废：运营下架/风控封禁 */
    VOID;

    /**
     * 券包筛选的合法值表，给 {@code MyCouponQuery.status} 的 {@code @Pattern} 引用。
     *
     * <p>写成字面量是因为注解元素值必须是编译期常量表达式（{@code String.join} 不算）；
     * 「枚举才是词表」这条由 {@code ValidationVocabularyTest} 断言本常量逐字节等于枚举名按声明序拼接，
     * 加状态忘了同步就红。
     */
    public static final String PATTERN = "UNUSED|LOCKED|USED|EXPIRED|VOID";
}
