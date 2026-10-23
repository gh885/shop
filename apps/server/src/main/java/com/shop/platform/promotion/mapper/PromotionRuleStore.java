package com.shop.platform.promotion.mapper;

import com.shop.platform.infra.db.RowMappers;
import com.shop.platform.promotion.api.AppliedRule;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 生效规则的点查。规则表住在 {@code promotion} schema，只有这里读它。
 *
 * <p>过滤放在 SQL 里而不是内存里：状态、时间窗、类目三条都在 where 子句，规则表再长也不会被捞进堆。
 * 排序也在 SQL 里（{@code priority, id}），算价拿到的顺序就是执行顺序——两处各排一次必然漂。
 */
@Component
public class PromotionRuleStore {

    /**
     * {@code category_ids IS NULL} 表示全类目规则；非空才和购物车的类目求交集。
     *
     * <p>用 {@code &&}（数组重叠）而不是 {@code = ANY}：一条规则可以绑多个类目，购物车也可以有多个类目，
     * 这里问的是"两个集合有没有交集"，不是"有没有包含"。
     */
    private static final String EFFECTIVE =
            """
            SELECT id, version, type, scope, bearer, threshold, rate_bp, fixed_amount,
                   base_mode, mutex_group, priority
              FROM promotion.promotion_rule
             WHERE status = 'active'
               AND (starts_at IS NULL OR starts_at <= now())
               AND (ends_at IS NULL OR ends_at > now())
               AND (category_ids IS NULL OR category_ids && CAST(:categoryIds AS uuid[]))
             ORDER BY priority, id
            """;

    private static final RowMapper<RuleRow> ROW = RowMappers.of(RuleRow.class);

    private final JdbcClient jdbc;

    public PromotionRuleStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public List<AppliedRule> effectiveRules(List<UUID> categoryIds) {
        return jdbc.sql(EFFECTIVE).param("categoryIds", toUuidArray(categoryIds)).query(ROW).list().stream()
                .map(RuleRow::toAppliedRule)
                .toList();
    }

    /**
     * Postgres 的 {@code uuid[]} 用文本字面量传，比纠结 {@code setArray} 的驱动差异稳。
     *
     * <p>不能直接传 {@code List<UUID>} 配 {@code ::uuid[]}：命名参数里 {@code :x::type} 的双冒号会被当成
     * 两个占位符。这里传 {@code '{...}'} 字面量，SQL 里是 {@code CAST(:x AS uuid[])}。
     */
    private static String toUuidArray(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return "{}";
        }
        return "{"
                + ids.stream()
                        .map(UUID::toString)
                        .reduce((left, right) -> left + "," + right)
                        .orElse("")
                + "}";
    }

    /**
     * 库里的行。枚举按「存小写、反解大写」的约定映射（见 {@link RowMappers}），不手写 getString。
     *
     * <p>{@code version} 是整数，出库拼成 {@code v1} 这样的字符串——报价单里存的是文本版本号，
     * 加一个 {@code v} 前缀是为了让它一眼看出来是版本而不是数量。
     */
    public record RuleRow(
            UUID id,
            int version,
            String type,
            AppliedRule.Scope scope,
            AppliedRule.Bearer bearer,
            Long threshold,
            Integer rateBp,
            Long fixedAmount,
            AppliedRule.BaseMode baseMode,
            String mutexGroup,
            int priority) {

        AppliedRule toAppliedRule() {
            return new AppliedRule(
                    id,
                    "v" + version,
                    type,
                    scope,
                    bearer,
                    threshold,
                    rateBp,
                    fixedAmount,
                    baseMode,
                    mutexGroup,
                    priority);
        }
    }
}
