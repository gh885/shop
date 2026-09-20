package com.shop.platform.product.api;

import com.shop.platform.common.Money;
import com.shop.platform.product.model.SkuStatus;
import java.util.UUID;

/**
 * SKU 只读视图：product.skus 的跨模块投影（展示与可用性字段）。
 * 状态判定用 {@link #onSale()}，不要读 {@link #status()} 自行比较魔法值。
 *
 * <p>价格是 Money 而不是裸分：跨模块传的就是「一笔钱」，币种跟着金额走才不需要每个消费方各自记住单位与币种
 * （入参侧同理，见 {@code SkuUpdateItem}）。
 */
public record SkuView(
        UUID id, UUID productId, String name, String image, Money price, Money originalPrice, SkuStatus status) {

    /** 是否在售（可下单/加购的 SKU 态闸门） */
    public boolean onSale() {
        return status != null && status.onSale();
    }
}
