package com.shop.platform.shop.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 店铺开店审核状态：待审 → 通过 / 驳回（终态）。
 *
 * <p>审核决定与店铺状态推进在<b>同一个模块内同事务直写</b>（{@code ShopReviewService.decide} 改
 * {@code shop.shops.status}），不经事件——事件是给别人的：不可营业时同事务发
 * {@code ShopTradingSuspendedEvent}，由 product 监听级联下架（ACC-72）。
 */
@Schema(enumAsRef = true)
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
