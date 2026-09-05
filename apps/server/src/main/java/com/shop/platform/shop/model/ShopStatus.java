package com.shop.platform.shop.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 店铺状态机：待审核 → 通过(ACTIVE) / 驳回(REJECTED)；ACTIVE ⇄ DISABLED。
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

    /** 禁用（平台封禁） */
    DISABLED;

    /** 唯一可营业态（下单/上架等业务闸门） */
    public boolean isActive() {
        return this == ACTIVE;
    }
}
