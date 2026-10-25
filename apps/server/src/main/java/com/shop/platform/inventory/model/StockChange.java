package com.shop.platform.inventory.model;

/**
 * 一次库存变动的前后快照，用来写 {@code stock_ledger} 的四列。
 *
 * <p>四个科目都要记前后值：只记两个，事后复原不了守恒式，等于没记。
 */
public record StockChange(Stock before, Stock after) {

    public StockChange {
        if (!before.skuId().equals(after.skuId())) {
            throw new IllegalArgumentException("前后不是同一个 SKU");
        }
    }

    public int availableDelta() {
        return after.availableToPromise() - before.availableToPromise();
    }

    public int reservedDelta() {
        return after.reserved() - before.reserved();
    }

    public int onHandDelta() {
        return after.onHand() - before.onHand();
    }

    public int safetyDelta() {
        return after.safety() - before.safety();
    }

    /** 是不是一次真实变动。{@code commit} 不动任何科目列，用它换出来的流水 quantity 恒为 0。 */
    public boolean movesLedger() {
        return availableDelta() != 0 || reservedDelta() != 0 || onHandDelta() != 0 || safetyDelta() != 0;
    }
}
