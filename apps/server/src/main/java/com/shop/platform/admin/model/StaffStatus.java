package com.shop.platform.admin.model;

/** 平台员工状态：正常 / 禁用。唯一闸门是是否正常，谓词语义 {@link #isActive()}。 */
public enum StaffStatus {

    /** 正常（可登录/操作后台） */
    ACTIVE,

    /** 禁用 */
    DISABLED;

    public boolean isActive() {
        return this == ACTIVE;
    }
}
