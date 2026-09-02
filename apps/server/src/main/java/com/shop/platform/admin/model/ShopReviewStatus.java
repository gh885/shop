package com.shop.platform.admin.model;

/** 店铺开店审核状态：待审 → 通过 / 驳回（终态）。审核决定经事件驱动 shop 模块落 ShopStatus。 */
public enum ShopReviewStatus {

    /** 待审 */
    PENDING,

    /** 通过 */
    APPROVED,

    /** 驳回 */
    REJECTED;

    public boolean isPending() {
        return this == PENDING;
    }
}
