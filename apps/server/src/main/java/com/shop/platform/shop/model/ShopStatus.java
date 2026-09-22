package com.shop.platform.shop.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 店铺状态机：待审核 → 通过(ACTIVE) / 驳回(REJECTED)；REJECTED →（卖家补材料重新提交）PENDING_REVIEW；
 * ACTIVE ⇄ DISABLED。
 *
 * <p>DB 存 {@code name()}（varchar）。唯一可营业态是 {@link #isActive()}。
 */
@Schema(enumAsRef = true)
public enum ShopStatus {

    /** 待平台审核 */
    PENDING_REVIEW,

    /** 正常（可营业/可交易） */
    ACTIVE,

    /** 审核驳回 */
    REJECTED,

    /**
     * 停止营业（平台封禁，或店主账号注销的连带处置）。
     *
     * <p>写入方必须与状态推进同事务播报 {@code ShopTradingSuspendedEvent}（ACC-72 立约）：
     * 目前两处都遵守——审核驳回与店主注销。直接改库会漏掉在架商品的级联下架。
     */
    DISABLED;

    /** 唯一可营业态（下单/上架等业务闸门） */
    public boolean isActive() {
        return this == ACTIVE;
    }
}
