package com.shop.platform.product.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 类目属性模板条目启用状态。同 categories 软删语义：不物理删除，禁用后新商品不可再选，存量引用自洽。
 *
 * <p>DB 存 {@code name()}（varchar）。
 */
@Schema(enumAsRef = true)
public enum CategoryAttrStatus {

    /** 禁用 */
    DISABLED,

    /** 启用 */
    ENABLED;

    public boolean isEnabled() {
        return this == ENABLED;
    }
}
