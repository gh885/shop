package com.shop.platform.product.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 平台标准品的状态。
 *
 * <p>不做物理删除：错匹配的收口是「合并」（MERGED + mergedInto 指向正确的那个），
 * 因为挂靠它的商家商品与历史映射都还引用着这一行——删掉只会留下悬空引用。
 *
 * <p>DB 存 {@code name()}（varchar），取值集由 {@code ck_standard_products_merged} 与 status 的 CHECK 同步。
 */
@Schema(enumAsRef = true)
public enum StandardProductStatus {

    /** 可用：可被商家商品挂靠、可参与聚合 */
    ACTIVE,

    /** 已并入另一个标准品（{@code merged_into} 指向去向），不再接受新挂靠 */
    MERGED;

    public boolean isActive() {
        return this == ACTIVE;
    }
}
