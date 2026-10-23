package com.shop.platform.promotion.mapper;

import com.shop.platform.infra.db.RowMappers;
import com.shop.platform.promotion.api.AppliedRule;
import com.shop.platform.promotion.model.PromotionRuleStatus;
import java.sql.Array;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 促销规则的读写。规则表住在 {@code promotion} schema，只有这里碰它。
 *
 * <p>过滤放在 SQL 里而不是内存里：状态、时间窗、类目三条都在 where 子句，规则表再长也不会被捞进堆。
 * 排序也在 SQL 里（{@code priority, id}），算价拿到的顺序就是执行顺序——两处各排一次必然漂。
 *
 * <p>两类读：{@link #effectiveRules} 给算价（只出 active、只出值对象），
 * {@link #list} / {@link #find} 给运营后台（出全部状态、带时间窗和类目）。
 * 合成一个方法就会让算价拿到 draft 的规则，或者让后台看不到下线的活动。
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

    private static final String LIST =
            """
            SELECT id, name, type, scope, bearer, threshold, rate_bp, fixed_amount, base_mode,
                   mutex_group, priority, category_ids, status, version, starts_at, ends_at,
                   created_at, updated_at
              FROM promotion.promotion_rule
             WHERE (CAST(:status AS text) IS NULL OR status = CAST(:status AS text))
             ORDER BY priority, id DESC
            """;

    private static final String FIND_ONE =
            """
            SELECT id, name, type, scope, bearer, threshold, rate_bp, fixed_amount, base_mode,
                   mutex_group, priority, category_ids, status, version, starts_at, ends_at,
                   created_at, updated_at
              FROM promotion.promotion_rule
             WHERE id = :id
            """;

    private static final String INSERT =
            """
            INSERT INTO promotion.promotion_rule
                (name, type, scope, bearer, threshold, rate_bp, fixed_amount, base_mode,
                 mutex_group, priority, category_ids, status, version, starts_at, ends_at)
            VALUES
                (:name, :type, :scope, :bearer, :threshold, :rateBp, :fixedAmount, :baseMode,
                 :mutexGroup, :priority, CAST(:categoryIds AS uuid[]), 'draft', 1, :startsAt, :endsAt)
            RETURNING id
            """;

    /**
     * 改内容。<b>{@code version = version + 1} 写在 SQL 里</b>，不由 service 算：
     * 两个人同时改，service 各读到 v3 各自 +1 都写成 v4，其中一次修改就被抹掉了。
     *
     * <p>{@code status <> 'archived'} 同理——判状态和写内容必须是同一句。
     */
    private static final String UPDATE_CONTENT =
            """
            UPDATE promotion.promotion_rule
               SET name = :name, type = :type, scope = :scope, bearer = :bearer,
                   threshold = :threshold, rate_bp = :rateBp, fixed_amount = :fixedAmount,
                   base_mode = :baseMode, mutex_group = :mutexGroup, priority = :priority,
                   category_ids = CAST(:categoryIds AS uuid[]),
                   starts_at = :startsAt, ends_at = :endsAt,
                   version = version + 1
             WHERE id = :id AND status <> 'archived'
            """;

    private static final String SET_STATUS =
            """
            UPDATE promotion.promotion_rule
               SET status = :status
             WHERE id = :id AND status <> 'archived'
            """;

    private static final RowMapper<RuleRow> ROW = RowMappers.of(RuleRow.class);

    private final JdbcClient jdbc;

    public PromotionRuleStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    // —— 算价读侧 ——

    public List<AppliedRule> effectiveRules(List<UUID> categoryIds) {
        return jdbc.sql(EFFECTIVE).param("categoryIds", toUuidArray(categoryIds)).query(ROW).list().stream()
                .map(RuleRow::toAppliedRule)
                .toList();
    }

    // —— 运营后台 ——

    public List<AdminRow> list(PromotionRuleStatus status) {
        return jdbc.sql(LIST)
                .param("status", status == null ? null : status.dbValue())
                .query(ADMIN_ROW)
                .list();
    }

    public Optional<AdminRow> find(UUID id) {
        return jdbc.sql(FIND_ONE).param("id", id).query(ADMIN_ROW).optional();
    }

    // —— 写 ——

    public UUID insert(AdminDraft draft) {
        return jdbc.sql(INSERT)
                .param("name", draft.name())
                .param("type", draft.type())
                .param("scope", draft.scope())
                .param("bearer", draft.bearer())
                .param("threshold", draft.threshold())
                .param("rateBp", draft.rateBp())
                .param("fixedAmount", draft.fixedAmount())
                .param("baseMode", draft.baseMode())
                .param("mutexGroup", draft.mutexGroup())
                .param("priority", draft.priority())
                .param("categoryIds", toUuidArray(draft.categoryIds()))
                .param("startsAt", RowMappers.toDb(draft.startsAt()))
                .param("endsAt", RowMappers.toDb(draft.endsAt()))
                .query(UUID.class)
                .single();
    }

    /** @return 影响行数；0 = 已归档或不存在，调用方据此报 409 */
    public int updateContent(UUID id, AdminDraft draft) {
        return jdbc.sql(UPDATE_CONTENT)
                .param("id", id)
                .param("name", draft.name())
                .param("type", draft.type())
                .param("scope", draft.scope())
                .param("bearer", draft.bearer())
                .param("threshold", draft.threshold())
                .param("rateBp", draft.rateBp())
                .param("fixedAmount", draft.fixedAmount())
                .param("baseMode", draft.baseMode())
                .param("mutexGroup", draft.mutexGroup())
                .param("priority", draft.priority())
                .param("categoryIds", toUuidArray(draft.categoryIds()))
                .param("startsAt", RowMappers.toDb(draft.startsAt()))
                .param("endsAt", RowMappers.toDb(draft.endsAt()))
                .update();
    }

    /** @return 影响行数；0 = 已归档或不存在 */
    public int setStatus(UUID id, PromotionRuleStatus status) {
        return jdbc.sql(SET_STATUS)
                .param("id", id)
                .param("status", status.dbValue())
                .update();
    }

    /**
     * Postgres 的 {@code uuid[]} 用文本字面量传，比纠结 {@code setArray} 的驱动差异稳。
     *
     * <p>不能直接传 {@code List<UUID>} 配 {@code ::uuid[]}：命名参数里 {@code :x::type} 的双冒号会被当成
     * 两个占位符。这里传 {@code '{...}'} 字面量，SQL 里是 {@code CAST(:x AS uuid[])}。
     */
    private static String toUuidArray(List<UUID> ids) {
        if (ids == null) {
            // null 和空数组不是一回事：null = 全类目，{} = 一个类目都不匹配。
            // 把 null 写成 {}，规则就会永远匹配不上——而且不报错，只是"活动没生效"。
            // CAST(NULL AS uuid[]) 得到的是 NULL，正是要的。
            return null;
        }
        if (ids.isEmpty()) {
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
     * 运营后台的行：比算价那份多出名称、状态、版本、时间窗、类目。
     *
     * <p>手写映射只因为 {@code category_ids} 是 {@code uuid[]}，{@code DataClassRowMapper} 不认。
     * 其余列照旧由它转——所以这个 mapper 只补那一列，别的一律不碰。
     */
    private static final RowMapper<AdminRow> ADMIN_ROW = (rs, index) -> new AdminRow(
            rs.getObject("id", UUID.class),
            rs.getString("name"),
            rs.getString("type"),
            AppliedRule.Scope.valueOf(rs.getString("scope").toUpperCase(Locale.ROOT)),
            AppliedRule.Bearer.valueOf(rs.getString("bearer").toUpperCase(Locale.ROOT)),
            rs.getObject("threshold", Long.class),
            rs.getObject("rate_bp", Integer.class),
            rs.getObject("fixed_amount", Long.class),
            AppliedRule.BaseMode.valueOf(rs.getString("base_mode").toUpperCase(Locale.ROOT)),
            rs.getString("mutex_group"),
            rs.getInt("priority"),
            readUuidArray(rs.getArray("category_ids")),
            PromotionRuleStatus.from(rs.getString("status")),
            rs.getInt("version"),
            rs.getTimestamp("starts_at") == null
                    ? null
                    : rs.getTimestamp("starts_at").toInstant(),
            rs.getTimestamp("ends_at") == null
                    ? null
                    : rs.getTimestamp("ends_at").toInstant(),
            rs.getTimestamp("created_at") == null
                    ? null
                    : rs.getTimestamp("created_at").toInstant(),
            rs.getTimestamp("updated_at") == null
                    ? null
                    : rs.getTimestamp("updated_at").toInstant());

    /** {@code null} 与空数组语义不同：null = 全类目，空数组 = 一个类目都不匹配。保留这个区别。 */
    private static List<UUID> readUuidArray(Array array) throws SQLException {
        if (array == null) {
            return null;
        }
        UUID[] values = (UUID[]) array.getArray();
        return values == null ? List.of() : List.copyOf(Arrays.asList(values));
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

    /** 运营后台看到的一整行。{@code categoryIds} 为 {@code null} 表示全类目。 */
    public record AdminRow(
            UUID id,
            String name,
            String type,
            AppliedRule.Scope scope,
            AppliedRule.Bearer bearer,
            Long threshold,
            Integer rateBp,
            Long fixedAmount,
            AppliedRule.BaseMode baseMode,
            String mutexGroup,
            int priority,
            List<UUID> categoryIds,
            PromotionRuleStatus status,
            int version,
            Instant startsAt,
            Instant endsAt,
            Instant createdAt,
            Instant updatedAt) {}

    /** 写入口的参数：枚举已经解好，时间已经转好，SQL 里不再做任何转换。 */
    public record AdminDraft(
            String name,
            String type,
            String scope,
            String bearer,
            Long threshold,
            Integer rateBp,
            Long fixedAmount,
            String baseMode,
            String mutexGroup,
            int priority,
            List<UUID> categoryIds,
            Instant startsAt,
            Instant endsAt) {}
}
