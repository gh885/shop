package com.shop.platform.product.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 类目启用状态。同 categories 软删语义：不物理删除，禁用节点查询时整支剪掉，可无损恢复。
 *
 * <p>DB 存 {@code name()}（varchar）。
 */
@Schema(enumAsRef = true)
public enum CategoryStatus {

    /** 禁用 */
    DISABLED,

    /** 启用 */
    ENABLED;

    public boolean isEnabled() {
        return this == ENABLED;
    }
}
