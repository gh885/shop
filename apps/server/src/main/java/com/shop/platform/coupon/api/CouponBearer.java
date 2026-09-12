package com.shop.platform.coupon.api;

/**
 * 优惠承担方 —— 谁为这笔减免买单，决定将来结算/分账时从谁的钱里扣。
 *
 * <p>放在 api 包而不是 model：它会落进订单的快照列（{@code orders.orders.coupon_bearer}），
 * 将来结算模块要按它拆账，是名副其实的<b>跨模块词汇</b>——model 包不允许被外模块引用（Modulith 字节码级校验）。
 *
 * <p>一期只有店铺券 → 恒 {@link #SELLER}；平台券（跨店分摊、平台自担）在三期。
 */
public enum CouponBearer {

    /** 卖家承担：从卖家货款里扣（店铺券） */
    SELLER,

    /** 平台承担：平台自己出钱（平台券，三期） */
    PLATFORM
}
