package com.shop.platform.trust.api;

/**
 * 一次售卖资格判定的结果。
 *
 * <p>不允许时带一个稳定的 reasonCode，接口层可以按它决定文案和前端动作；不要把中文句子塞进这里，
 * 文案属于展示层。
 */
public record SellDecision(boolean allowed, String reasonCode) {

    public static final String MERCHANT_NOT_ACTIVE = "MERCHANT_NOT_ACTIVE";
    public static final String CATEGORY_NOT_GRANTED = "CATEGORY_NOT_GRANTED";
    public static final String CREDENTIAL_EXPIRED = "CREDENTIAL_EXPIRED";
    public static final String BRAND_NOT_GRANTED = "BRAND_NOT_GRANTED";

    /**
     * 类目要求的资质这个商家没有。
     *
     * <p>和 {@link #CREDENTIAL_EXPIRED} 分开：那个是"有但过期了"，这个是"压根没这个类型"。
     * 前者的动作是续期，后者是去办一张——前端提示完全不同。
     */
    public static final String CREDENTIAL_MISSING = "CREDENTIAL_MISSING";

    public static SellDecision allow() {
        return new SellDecision(true, null);
    }

    public static SellDecision deny(String reasonCode) {
        return new SellDecision(false, reasonCode);
    }
}
