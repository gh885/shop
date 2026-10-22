package com.shop.platform.common.id;

import java.util.Objects;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 连续号段发号器。只发给「不能有空号」的号：凭证编号、发票号、对账单号。
 *
 * <p>为什么不用 PG 的 {@code SEQUENCE}：sequence 的值在事务回滚时不回退，必然留下空号。这里是一行普通数据，更新和业务写在
 * 同一个事务里，回滚就一起回滚，号才连续。
 *
 * <p>代价是同一 {@code (namespace, period)} 上的写会串行排队，所以它不适合订单号这类高频号——那个走 {@link BizNo}，
 * 本地随机生成，允许空号。
 *
 * <p><b>调用方必须在事务里。</b> 否则"号被发出去"和"业务数据写成功"不是原子的，回滚时号不会退回来。
 *
 * <p>也不要预取号段（一次要 1000 个慢慢用）。预取之后任何一次回滚都会整段作废，空号照样出现——那正是它要防的事。
 */
@Component
public class BizSequence {

    /** 一次取到的号段，闭区间。 */
    public record Range(long first, long last) {

        public Range {
            if (first < 1 || last < first) {
                throw new IllegalArgumentException("非法号段: " + first + ".." + last);
            }
        }

        public long size() {
            return last - first + 1;
        }
    }

    /**
     * {@code ON CONFLICT DO UPDATE} 在 PG 里是原子的：并发打同一个新 key 时，一个插入、其余阻塞后走更新分支，
     * 不会出现唯一键冲突。
     */
    private static final String TAKE =
            """
            INSERT INTO common.biz_sequence (ns, period, last_value, updated_at)
            VALUES (:ns, :period, :count, now())
            ON CONFLICT (ns, period) DO UPDATE
                SET last_value = common.biz_sequence.last_value + EXCLUDED.last_value,
                    updated_at = now()
            RETURNING last_value
            """;

    private final JdbcClient jdbc;

    public BizSequence(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 取一个号。 */
    public long next(String namespace, String period) {
        return take(namespace, period, 1).last();
    }

    /** 一次取 {@code count} 个连号，返回闭区间。 */
    public Range take(String namespace, String period, int count) {
        if (namespace == null || namespace.isBlank()) {
            throw new IllegalArgumentException("namespace 不能为空");
        }
        if (period == null) {
            throw new IllegalArgumentException("period 不能为 null，不分周期的写空串");
        }
        if (count < 1) {
            throw new IllegalArgumentException("count 必须 >= 1: " + count);
        }

        Long last = jdbc.sql(TAKE)
                .param("ns", namespace)
                .param("period", period)
                .param("count", (long) count)
                .query(Long.class)
                .optional()
                .orElse(null);
        if (last == null) {
            throw new IllegalStateException("发号失败，没有返回行: " + namespace + "/" + period);
        }
        return new Range(last - count + 1, last);
    }
}
