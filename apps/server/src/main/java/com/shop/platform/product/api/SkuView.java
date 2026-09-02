package com.shop.platform.product.api;

import com.shop.platform.product.model.SkuStatus;
import java.util.UUID;

/**
 * SKU 只读视图：product.skus 的跨模块投影（展示与可用性字段）。
 * 状态判定用 {@link #onSale()}，不要读 {@link #status()} 自行比较魔法值。
 */
public record SkuView(
        UUID id,
        UUID productId,
        String name,
        String image,
        Long price,
        Long originalPrice,
        String currency,
        SkuStatus status) {

    /** 是否在售（可下单/加购的 SKU 态闸门） */
    public boolean onSale() {
        return status != null && status.onSale();
    }
}
