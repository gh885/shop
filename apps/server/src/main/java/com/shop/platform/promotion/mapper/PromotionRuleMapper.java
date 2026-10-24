package com.shop.platform.promotion.mapper;

import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.db.UuidArrayTypeHandler;
import com.shop.platform.promotion.api.AppliedRule;
import com.shop.platform.promotion.model.PromotionRuleStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Arg;
import org.apache.ibatis.annotations.ConstructorArgs;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

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
@Mapper
public interface PromotionRuleMapper {

    /**
     * {@code category_ids IS NULL} 表示全类目规则；非空才和购物车的类目求交集。
     *
     * <p>用 {@code &&}（数组重叠）而不是 {@code = ANY}：一条规则可以绑多个类目，购物车也可以有多个类目，
     * 这里问的是"两个集合有没有交集"，不是"有没有包含"。
     */
    @Select(
            """
            SELECT id, version, type, scope, bearer, threshold, rate_bp, fixed_amount,
                   base_mode, mutex_group, priority
              FROM promotion.promotion_rule
             WHERE status = 'active'
               AND (starts_at IS NULL OR starts_at <= now())
               AND (ends_at IS NULL OR ends_at > now())
               AND (category_ids IS NULL OR category_ids && CAST(#{categoryIds} AS uuid[]))
             ORDER BY priority, id
            """)
    List<RuleRow> selectEffective(@Param("categoryIds") String categoryIdsLiteral);

    /** 算价读侧：只出 active、只出值对象。 */
    default List<AppliedRule> effectiveRules(List<UUID> categoryIds) {
        return selectEffective(toUuidArray(categoryIds)).stream()
                .map(RuleRow::toAppliedRule)
                .toList();
    }

    @Select(
            """
            SELECT id, name, type, scope, bearer, threshold, rate_bp, fixed_amount, base_mode,
                   mutex_group, priority, category_ids, status, version, starts_at, ends_at,
                   created_at, updated_at
              FROM promotion.promotion_rule
             WHERE (CAST(#{status} AS text) IS NULL OR status = CAST(#{status} AS text))
             ORDER BY priority, id DESC
            """)
    @ConstructorArgs({
        @Arg(column = "id", javaType = UUID.class),
        @Arg(column = "name", javaType = String.class),
        @Arg(column = "type", javaType = String.class),
        @Arg(column = "scope", javaType = AppliedRule.Scope.class),
        @Arg(column = "bearer", javaType = AppliedRule.Bearer.class),
        @Arg(column = "threshold", javaType = Long.class),
        @Arg(column = "rate_bp", javaType = Integer.class),
        @Arg(column = "fixed_amount", javaType = Long.class),
        @Arg(column = "base_mode", javaType = AppliedRule.BaseMode.class),
        @Arg(column = "mutex_group", javaType = String.class),
        @Arg(column = "priority", javaType = int.class),
        @Arg(column = "category_ids", javaType = List.class, typeHandler = UuidArrayTypeHandler.class),
        @Arg(column = "status", javaType = PromotionRuleStatus.class),
        @Arg(column = "version", javaType = int.class),
        @Arg(column = "starts_at", javaType = Instant.class),
        @Arg(column = "ends_at", javaType = Instant.class),
        @Arg(column = "created_at", javaType = Instant.class),
        @Arg(column = "updated_at", javaType = Instant.class),
    })
    List<AdminRow> selectList(@Param("status") PromotionRuleStatus status);

    /** 运营后台列表：{@code status} 传 null 表示全部状态。 */
    default List<AdminRow> list(PromotionRuleStatus status) {
        return selectList(status);
    }

    @Select(
            """
            SELECT id, name, type, scope, bearer, threshold, rate_bp, fixed_amount, base_mode,
                   mutex_group, priority, category_ids, status, version, starts_at, ends_at,
                   created_at, updated_at
              FROM promotion.promotion_rule
             WHERE id = #{id}
            """)
    @ConstructorArgs({
        @Arg(column = "id", javaType = UUID.class),
        @Arg(column = "name", javaType = String.class),
        @Arg(column = "type", javaType = String.class),
        @Arg(column = "scope", javaType = AppliedRule.Scope.class),
        @Arg(column = "bearer", javaType = AppliedRule.Bearer.class),
        @Arg(column = "threshold", javaType = Long.class),
        @Arg(column = "rate_bp", javaType = Integer.class),
        @Arg(column = "fixed_amount", javaType = Long.class),
        @Arg(column = "base_mode", javaType = AppliedRule.BaseMode.class),
        @Arg(column = "mutex_group", javaType = String.class),
        @Arg(column = "priority", javaType = int.class),
        @Arg(column = "category_ids", javaType = List.class, typeHandler = UuidArrayTypeHandler.class),
        @Arg(column = "status", javaType = PromotionRuleStatus.class),
        @Arg(column = "version", javaType = int.class),
        @Arg(column = "starts_at", javaType = Instant.class),
        @Arg(column = "ends_at", javaType = Instant.class),
        @Arg(column = "created_at", javaType = Instant.class),
        @Arg(column = "updated_at", javaType = Instant.class),
    })
    Optional<AdminRow> find(@Param("id") UUID id);

    /** 新建落库。id 由应用侧生成（Ids.newId()），与全项目 UUID 主键的口径一致。 */
    default UUID insert(AdminDraft draft) {
        UUID id = Ids.newId();
        insertRow(id, draft, toUuidArray(draft.categoryIds()));
        return id;
    }

    @Insert(
            """
            INSERT INTO promotion.promotion_rule
                (id, name, type, scope, bearer, threshold, rate_bp, fixed_amount, base_mode,
                 mutex_group, priority, category_ids, status, version, starts_at, ends_at)
            VALUES
                (#{id}, #{draft.name}, #{draft.type}, #{draft.scope}, #{draft.bearer}, #{draft.threshold},
                 #{draft.rateBp}, #{draft.fixedAmount}, #{draft.baseMode},
                 #{draft.mutexGroup}, #{draft.priority}, CAST(#{categoryIds} AS uuid[]), 'draft', 1,
                 #{draft.startsAt}, #{draft.endsAt})
            """)
    void insertRow(@Param("id") UUID id, @Param("draft") AdminDraft draft, @Param("categoryIds") String categoryIds);

    /**
     * 改内容。<b>{@code version = version + 1} 写在 SQL 里</b>，不由 service 算：
     * 两个人同时改，service 各读到 v3 各自 +1 都写成 v4，其中一次修改就被抹掉了。
     *
     * <p>{@code status <> 'archived'} 同理——判状态和写内容必须是同一句。
     *
     * @return 影响行数；0 = 已归档或不存在，调用方据此报 409
     */
    default int updateContent(UUID id, AdminDraft draft) {
        return updateContentRow(id, draft, toUuidArray(draft.categoryIds()));
    }

    @Update(
            """
            UPDATE promotion.promotion_rule
               SET name = #{draft.name}, type = #{draft.type}, scope = #{draft.scope}, bearer = #{draft.bearer},
                   threshold = #{draft.threshold}, rate_bp = #{draft.rateBp}, fixed_amount = #{draft.fixedAmount},
                   base_mode = #{draft.baseMode}, mutex_group = #{draft.mutexGroup}, priority = #{draft.priority},
                   category_ids = CAST(#{categoryIds} AS uuid[]),
                   starts_at = #{draft.startsAt}, ends_at = #{draft.endsAt},
                   version = version + 1
             WHERE id = #{id} AND status <> 'archived'
            """)
    int updateContentRow(
            @Param("id") UUID id, @Param("draft") AdminDraft draft, @Param("categoryIds") String categoryIds);

    /** @return 影响行数；0 = 已归档或不存在 */
    @Update(
            """
            UPDATE promotion.promotion_rule
               SET status = #{status}
             WHERE id = #{id} AND status <> 'archived'
            """)
    int setStatus(@Param("id") UUID id, @Param("status") PromotionRuleStatus status);

    /**
     * Postgres 的 {@code uuid[]} 用文本字面量传，比纠结 {@code setArray} 的驱动差异稳。
     *
     * <p>这里传 {@code '{...}'} 字面量，SQL 里是 {@code CAST(#{x} AS uuid[])}。
     */
    static String toUuidArray(List<UUID> ids) {
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
     * 库里的行。枚举按「存小写、反解大写」的约定映射（见 {@code DbEnumTypeHandler}），不手写 getString。
     *
     * <p>{@code version} 是整数，出库拼成 {@code v1} 这样的字符串——报价单里存的是文本版本号，
     * 加一个 {@code v} 前缀是为了让它一眼看出来是版本而不是数量。
     */
    record RuleRow(
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
    record AdminRow(
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
    record AdminDraft(
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
