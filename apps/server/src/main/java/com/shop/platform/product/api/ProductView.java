package com.shop.platform.product.api;

import com.shop.platform.common.Money;
import com.shop.platform.product.model.ProductStatus;
import java.util.UUID;

/**
 * SPU 只读视图：product.products 的跨模块投影（分组/卡片/可用性字段）。
 * 状态判定用 {@link #published()}，不要读 {@link #status()} 自行比较魔法值。
 *
 * <p>价格区间是 Money（未定价的草稿两端为 null）：跨模块只传 Money，币种不靠消费方补。
 */
public record ProductView(
        UUID id, UUID shopId, String name, String mainImage, Money minPrice, Money maxPrice, ProductStatus status) {

    /** 是否已上架（对买家可见的 SPU 态闸门） */
    public boolean published() {
        return status != null && status.isPublished();
    }
}
