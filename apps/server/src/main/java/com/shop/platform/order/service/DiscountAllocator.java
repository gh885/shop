package com.shop.platform.order.service;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;

/**
 * 优惠与运费的行级分摊（docs/domain/order-model.md §6.1）。
 *
 * <p>纯函数：输入行金额与池子，输出每行分到多少，不碰库、不读时钟、不依赖 Money 的币种
 * （调用方保证同一订单内同币种）。两个池子口径不同：
 * <ul>
 *   <li>优惠有「不能超过本行金额」的硬顶（INV-9），摊不完就是结算数据自相矛盾 → 拒绝下单；
 *   <li>运费没有定向概念，按行金额占比分摊，不设行金额上限（运费可以高于商品本身）。
 * </ul>
 *
 * <p>取整口径：先按占比向下取整，再把余数从行序号最大的行往前补，且不越过该行的剩余额度。
 * 这样既满足「余数归行序号最大的行」，又不会把最后一行补成负实付。
 */
public final class DiscountAllocator {

    private DiscountAllocator() {}

    /** 定向优惠的落点：用掉多少、作废多少（券面额大于行金额时，余量不能挪给别的行） */
    public record Targeted(long applied, long wasted) {}

    /**
     * 定向优惠分配到单行：额度不足时用尽该行额度，剩余作废（§6.1 例 1）。
     *
     * @param lineAmount 该行可减基数
     * @param couponAmount 券面额
     */
    public static Targeted applyTargeted(long lineAmount, long couponAmount) {
        requireNonNegative(lineAmount, "行金额");
        requireNonNegative(couponAmount, "优惠金额");
        long applied = Math.min(lineAmount, couponAmount);
        return new Targeted(applied, couponAmount - applied);
    }

    /**
     * 兜底池按行金额占比分摊，每行不超过自身金额（INV-9）。
     *
     * <p>池子大于全部行额度时无解——这正是 §6.1 例 2 的「discount_amount 与行金额明细矛盾」，
     * 抛 {@link IllegalArgumentException} 由下单入口拒绝，而不是悄悄少收。
     */
    public static long[] allocateDiscount(long pool, List<Long> lineAmounts) {
        requireNonNegative(pool, "优惠池");
        long total = requireAmounts(lineAmounts);
        if (pool > total) {
            throw new IllegalArgumentException("优惠金额超过可分摊的商品金额");
        }
        return allocate(pool, lineAmounts, total);
    }

    /**
     * 运费按行金额占比分摊（子订单级，§6.1 第 4 步）。运费不封顶到行金额，但总额必须非负；
     * 行金额全为 0 时（理论上不会出现，数量 ≥ 1 且单价 ≥ 0）全部落在最后一行，避免除零。
     */
    public static long[] allocateShipping(long shippingFee, List<Long> lineAmounts) {
        requireNonNegative(shippingFee, "运费");
        requireAmounts(lineAmounts);
        long total = lineAmounts.stream().mapToLong(Long::longValue).sum();
        if (total == 0) {
            long[] out = new long[lineAmounts.size()];
            if (out.length == 0) {
                return out;
            }
            out[out.length - 1] = shippingFee;
            return out;
        }
        long[] out = proportional(shippingFee, lineAmounts, total);
        long remainder = shippingFee - sum(out);
        if (remainder > 0) {
            // 运费不设行金额上限，余数直接归行序号最大的行
            out[out.length - 1] += remainder;
        }
        return out;
    }

    /** 占比向下取整 + 余数从末行往前补 */
    private static long[] allocate(long pool, List<Long> lineAmounts, long total) {
        long[] out = proportional(pool, lineAmounts, total);
        long allocated = sum(out);
        long remainder = pool - allocated;
        for (int i = out.length - 1; i >= 0 && remainder > 0; i--) {
            long room = lineAmounts.get(i) - out[i];
            long add = Math.min(room, remainder);
            out[i] += add;
            remainder -= add;
        }
        if (remainder > 0) {
            // 理论上不可达：pool ≤ total 且逐行补满后容量之和 = total
            throw new IllegalStateException("优惠分摊未能用完池子");
        }
        return out;
    }

    private static long[] proportional(long pool, List<Long> lineAmounts, long total) {
        long[] out = new long[lineAmounts.size()];
        if (pool == 0 || out.length == 0) {
            return out;
        }
        BigInteger poolValue = BigInteger.valueOf(pool);
        BigInteger totalValue = BigInteger.valueOf(total);
        for (int i = 0; i < out.length; i++) {
            out[i] = poolValue
                    .multiply(BigInteger.valueOf(lineAmounts.get(i)))
                    .divide(totalValue)
                    .longValueExact();
        }
        return out;
    }

    private static long requireAmounts(List<Long> lineAmounts) {
        if (lineAmounts == null || lineAmounts.isEmpty()) {
            throw new IllegalArgumentException("分摊至少需要一行");
        }
        List<Long> checked = new ArrayList<>(lineAmounts.size());
        for (Long amount : lineAmounts) {
            if (amount == null) {
                throw new IllegalArgumentException("行金额不能为空");
            }
            requireNonNegative(amount, "行金额");
            checked.add(amount);
        }
        return checked.stream().mapToLong(Long::longValue).sum();
    }

    private static void requireNonNegative(long value, String what) {
        if (value < 0) {
            throw new IllegalArgumentException(what + "不能为负");
        }
    }

    private static long sum(long[] values) {
        long sum = 0;
        for (long value : values) {
            sum += value;
        }
        return sum;
    }
}
