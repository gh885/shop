package com.shop.platform.account.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 账号状态：正常 / 禁用。唯一闸门是「是否正常」，谓词语义 {@link #isActive()}。
 *
 * <p>DB 存 {@code name()}（varchar）。短信自动注册固定 ACTIVE；禁用/注销走 {@code DISABLED}（不做物理删除）。
 */
@Schema(enumAsRef = true)
public enum UserStatus {

    /** 正常（可登录/交易） */
    ACTIVE,

    /** 禁用/注销 */
    DISABLED;

    /** 唯一栅门：是否正常账号 */
    public boolean isActive() {
        return this == ACTIVE;
    }
}
