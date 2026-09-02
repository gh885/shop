package com.shop.platform.cms.model;

/**
 * CMS 内容启用状态：导航入口、Banner、推荐 Tab 共用。不做物理删除，停用后前台不展示。
 *
 * <p>DB 存 {@code name()}（varchar）。
 */
public enum CmsStatus {

    /** 停用 */
    DISABLED,

    /** 启用 */
    ENABLED;

    public boolean isEnabled() {
        return this == ENABLED;
    }
}
