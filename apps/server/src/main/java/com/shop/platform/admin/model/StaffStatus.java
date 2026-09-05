package com.shop.platform.admin.model;

import io.swagger.v3.oas.annotations.media.Schema;

/** 平台员工状态：正常 / 禁用。唯一闸门是是否正常，谓词语义 {@link #isActive()}。 */
@Schema(enumAsRef = true)
public enum StaffStatus {

    /** 正常（可登录/操作后台） */
    ACTIVE,

    /** 禁用 */
    DISABLED;

    public boolean isActive() {
        return this == ACTIVE;
    }
}
