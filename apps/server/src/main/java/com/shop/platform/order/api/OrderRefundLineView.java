package com.shop.platform.order.api;

import com.shop.platform.common.Money;
import java.util.UUID;

/**
 * 订单行的退款账本视图：aftersale 算「这一行还能退几件、该退多少钱」的唯一输入。
 *
 * <p>两个额度分开给，因为两条退款路径的货去向不同（§8）：
 * <ul>
 *   <li>仅退款退「还没发出去的货」：上限 = 购买量 − 已发 − 已退，即 {@link #unshippedRefundableQuantity()}；</li>
 *   <li>退货退款退「已发出、寄回的货」：上限 = 当前有效发货量，即 {@link #returnableQuantity()}。</li>
 * </ul>
 *
 * <p>金额按行实付（{@code goods_paid_amount}）与行已退计算，运费不在这里——运费是子订单级、整单退满才退（§6.2）。
 */
public record OrderRefundLineView(
        UUID orderItemId,
        String name,
        UUID skuId,
        int quantity,
        int shippedQuantity,
        int refundedQuantity,
        Money goodsPaidAmount,
        Money refundedAmount,
        /** 下单瞬间的「支持七天无理由」快照：判买家法定退货权只读它，不读商品现值（AFS-45） */
        boolean sevenDayReturn) {

    /** 仅退款还能退几件：购买量 − 已发 − 已退（已发的货走退货退款，不在这里） */
    public int unshippedRefundableQuantity() {
        return quantity - shippedQuantity - refundedQuantity;
    }

    /** 退货退款还能退几件：当前有效发货量（退货扣回、取消包裹也回退） */
    public int returnableQuantity() {
        return shippedQuantity;
    }

    /** 这一行还剩多少商品款可退（分）：最后一次退款退剩余额，之后恒 0（INV-13） */
    public long remainingGoodsAmount() {
        return goodsPaidAmount.amount() - refundedAmount.amount();
    }
}
