package com.shop.platform.returns.model;

/**
 * 退款金额的算法。**全平台只有这一处**——售后、自动退款、部分退都调它。
 *
 * <p>规则来自 pricing 的快照分摊：一行实付是 {@code payableAmount}，按件摊开，
 * 退 {@code q} 件就退这 q 件摊到的钱。
 *
 * <p>关键的一条：**退剩余全部件数时，退剩余全部金额**。不这么写，多次部分退之后
 * 因为每次向下取整，最后会剩几分钱永远退不掉——账上就永远差一分。
 */
public final class RefundAmount {

    private RefundAmount() {}

    /**
     * @param remainingPayable 这一行还没退的实付（不是原价，已经扣过优惠分摊）
     * @param remainingQty 这一行还没退的件数
     * @param quantity 本次要退的件数，必须 &le; {@code remainingQty}
     */
    public static long of(long remainingPayable, int remainingQty, int quantity) {
        if (quantity <= 0) {
            throw new IllegalArgumentException("退款件数必须为正: " + quantity);
        }
        if (remainingQty <= 0) {
            throw new IllegalStateException("这一行已经退完，没有可退件数");
        }
        if (quantity > remainingQty) {
            throw new IllegalArgumentException("退款件数超过剩余可退: " + quantity + " > " + remainingQty);
        }
        if (quantity == remainingQty) {
            return remainingPayable;
        }
        return remainingPayable * quantity / remainingQty;
    }
}
