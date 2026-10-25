package com.shop.platform.inventory.model;

import java.util.UUID;

/**
 * 一个 SKU 在一个仓的四个科目。
 *
 * <p>恒等式 {@code onHand = availableToPromise + reserved + safety} 由数据库 {@code ck_stock_balance} 保证，
 * 这里只是快照，不做第二份校验——校验两份就会有两份不一致。
 *
 * <p>也直接用作 {@code inventory.stock} 的行映射目标：列名 {@code sku_id / warehouse_id / on_hand ...}
 * 按驼峰对得上，所以 SQL 的 {@code RETURNING} 把七列带全就能映射成它，不需要额外的 Row 类型。
 */
public record Stock(
        UUID skuId, UUID warehouseId, UUID merchantId, int onHand, int availableToPromise, int reserved, int safety) {

    public Stock {
        if (onHand != availableToPromise + reserved + safety) {
            throw new IllegalStateException("库存守恒式被破坏: on_hand=%d, availableToPromise=%d, reserved=%d, safety=%d"
                    .formatted(onHand, availableToPromise, reserved, safety));
        }
    }
}
