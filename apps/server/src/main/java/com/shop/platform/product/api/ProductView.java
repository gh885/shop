package com.shop.platform.product.api;

import java.util.UUID;

/**
 * SPU 只读视图：product.products 的跨模块投影（分组/卡片/可用性字段）。
 * 状态判定用 {@link #published()}，不要读 {@link #status()} 自行比较魔法值。
 */
public record ProductView(
        UUID id, UUID shopId, String name, String mainImage, Long minPrice, Long maxPrice, Integer status) {

    /** 上架状态值，魔法值私有在本模块；消费方用 {@link #published()} */
    private static final int STATUS_PUBLISHED = 1;

    /** 是否已上架（对买家可见的 SPU 态闸门） */
    public boolean published() {
        return status != null && status == STATUS_PUBLISHED;
    }
}
