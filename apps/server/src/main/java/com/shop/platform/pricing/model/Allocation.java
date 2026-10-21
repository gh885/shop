package com.shop.platform.pricing.model;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 最大余数法。**全平台唯一实现**——第二个实现就是第一处不一致。
 *
 * <p>四条性质全部来自算法本身，不靠调用方小心：
 *
 * <ul>
 *   <li>和恒等于 {@code amount}，没有尾差要人工处理
 *   <li>每项非负
 *   <li>与输入顺序无关（排序是全序）
 *   <li>同输入同输出（全整数，无浮点、无哈希遍历）
 * </ul>
 *
 * <p>「尾差给最后一行」那种写法是错的：它让最后一行的金额系统性偏大，退货时一看就露。
 */
public final class Allocation {

    private Allocation() {}

    /** 参与分摊的一项：并列键在 {@code lineNo} 上打破，保证全序。 */
    public record Item(int lineNo, long weight) {}

    /**
     * 把 {@code amount} 按 {@code items} 的权重分下去。
     *
     * @return 每项的整数分摊额，键是 {@code lineNo}，按原顺序
     * @throws IllegalArgumentException 总额为 0（没有可分摊的基数）或权重之和不为正
     */
    public static Map<Integer, Long> allocate(long amount, List<Item> items) {
        if (amount < 0) {
            throw new IllegalArgumentException("分摊金额不能为负: " + amount);
        }
        if (items.isEmpty()) {
            return Map.of();
        }
        long total = items.stream().mapToLong(Item::weight).sum();
        if (total <= 0) {
            throw new IllegalArgumentException("分摊基数必须为正");
        }

        long assigned = 0;
        List<long[]> rows = new ArrayList<>(items.size());
        for (Item item : items) {
            if (item.weight() < 0) {
                throw new IllegalArgumentException("权重不能为负: " + item.weight());
            }
            long base = amount * item.weight() / total;
            // frac 用 mod 表达小数的分子，避免任何浮点
            rows.add(new long[] {item.lineNo(), base, amount * item.weight() % total});
            assigned += base;
        }

        long gap = amount - assigned;
        // 全序：先按余数降序，并列按行号升序。gap 一定小于项数，所以取前 gap 项各加 1 就把尾差分完
        rows.sort(Comparator.comparingLong((long[] row) -> -row[2]).thenComparingLong(row -> row[0]));
        for (int index = 0; index < gap; index++) {
            rows.get(index)[1]++;
        }

        // 按原顺序返回：调用方的下标不动，避免"分对了但贴错了行"
        Map<Integer, Long> result = new LinkedHashMap<>();
        rows.sort(Comparator.comparingLong(row -> row[0]));
        for (long[] row : rows) {
            result.put((int) row[0], row[1]);
        }
        return result;
    }
}
