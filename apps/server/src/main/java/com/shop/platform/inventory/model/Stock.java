package com.shop.platform.inventory.model;

import java.util.UUID;

/**
 * 一个 SKU 在一个仓的四个科目。
 *
 * <p>恒等式 {@code onHand = available + reserved + safety} 由数据库 {@code ck_stock_balance} 保证，
 * 这里只是快照，不做第二份校验——校验两份就会有两份不一致。
 */
public record Stock(
        UUID skuId, UUID warehouseId, UUID merchantId, int onHand, int available, int reserved, int safety) {

    public Stock {
        if (onHand != available + reserved + safety) {
            throw new IllegalStateException("库存守恒式被破坏: on_hand=%d, available=%d, reserved=%d, safety=%d"
                    .formatted(onHand, available, reserved, safety));
        }
    }
}
