package com.shop.platform.clearing.model;

/**
 * 一笔退款里，商家该承担多少。
 *
 * <p><b>为什么需要这个换算。</b> 买家退的是 {@code payableAmount}（商品款 + 运费），商家损失的是
 * {@code net}（商品款 − 佣金）。两者差一个佣金比例，直接拿退款额去减净额，商家就被多扣了佣金那部分。
 *
 * <h2>两条规则</h2>
 *
 * <ol>
 *   <li><b>按 {@code net : payableAmount} 拆。</b> 退一半的钱，商家承担一半的净额——和冻结用的是同一套比例，
 *       两处不一致的话，冻了 378952 却冲 398950，余额会凭空少一截
 *   <li><b>退满就把余数一次给掉。</b> 整数除法每次截断，多次部分退款之后会剩几分钱永远冲不完。
 *       所以"这一笔之后退款总额达到 payableAmount"时，商家承担的就是 {@code net} 减去已承担的部分
 * </ol>
 *
 * <h2>为什么用"累计之差"而不是"每次单独算"</h2>
 *
 * 冲销要的是<b>增量</b>：{@code f(已退 + 本次) − f(已退)}。这样不管分几次退，
 * 累加起来永远精确等于 {@code f(总退款)}，不会因为逐次截断而漂移。
 *
 * <p>纯函数，无状态，不碰库——和 {@code pricing} 的 {@code Allocation} 是同一个位置。
 */
public final class MerchantShare {

    private MerchantShare() {}

    /**
     * 累计退款 {@code refundedTotal} 对应的商家承担额。
     *
     * @param refundedTotal 买家累计退款（{@code payableAmount} 口径）
     * @param netAmount     该子单商家净额（{@code payableAmount − commission}）
     * @param payableAmount 该子单买家应付
     * @return 商家应承担的金额，落在 {@code [0, netAmount]}
     */
    public static long of(long refundedTotal, long netAmount, long payableAmount) {
        if (refundedTotal <= 0) {
            return 0;
        }
        if (payableAmount <= 0) {
            // 没有应付就没有可拆的比例，全额退款就只能全算商家的
            return refundedTotal;
        }
        if (refundedTotal >= payableAmount) {
            // 退满：把比例除法剩下的零头一次给掉，否则永远差几分钱
            return netAmount;
        }
        return refundedTotal * netAmount / payableAmount;
    }

    /**
     * 本次退款对应的商家承担<b>增量</b>。
     *
     * @param alreadyRefunded 本次之前买家已累计退款（{@code payableAmount} 口径）
     */
    public static long increment(long alreadyRefunded, long refundAmount, long netAmount, long payableAmount) {
        return of(alreadyRefunded + refundAmount, netAmount, payableAmount)
                - of(alreadyRefunded, netAmount, payableAmount);
    }
}
