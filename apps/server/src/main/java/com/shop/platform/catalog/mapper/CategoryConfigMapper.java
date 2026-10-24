package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.model.BrandPolicy;
import com.shop.platform.catalog.model.CategoryConfig;
import com.shop.platform.catalog.model.ValueType;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 类目配置的读写。<b>只对叶子类目存在</b>，一行一个类目。
 *
 * <p>没有继承、没有沿链合并。读一个叶子的配置就是一条 {@code WHERE category_id = ?}——
 * "L1 配了会不会影响 L3"这个问题不存在，因为 L1 根本没有配置行。
 *
 * <p>属性模板也住这里（{@code catalog.attribute} 表），同样只挂叶子。
 */
@Mapper
public interface CategoryConfigMapper {

    default Optional<CategoryConfig> find(UUID categoryId) {
        return findRow(categoryId).map(row -> row.toConfig(attributes(categoryId)));
    }

    @Select(
            """
            SELECT category_id AS categoryId, identity_keys AS identityKeys,
                   sku_identity_kinds AS skuIdentityKinds, match_strategies AS matchStrategies,
                   brand_policy AS brandPolicy, qualification_codes AS qualificationCodes,
                   auto_approve AS autoApprove, created_at AS createdAt, updated_at AS updatedAt
              FROM catalog.category_config
             WHERE category_id = #{categoryId}
            """)
    Optional<ConfigRow> findRow(@Param("categoryId") UUID categoryId);

    default List<CategoryConfig.AttributeView> attributes(UUID categoryId) {
        return findAttributeRows(categoryId).stream().map(AttributeRow::toView).toList();
    }

    @Select(
            """
            SELECT id, category_id AS categoryId, code, name, value_type AS valueType, unit, options,
                   is_sales_spec AS salesSpec,
                   is_required   AS required,
                   is_identity   AS identity,
                   is_filterable AS filterable,
                   is_multi      AS multi,
                   status, sort
              FROM catalog.attribute
             WHERE category_id = #{categoryId}
             ORDER BY sort, code
            """)
    List<AttributeRow> findAttributeRows(@Param("categoryId") UUID categoryId);

    default List<String> existingAttributeCodes(UUID categoryId, List<String> codes) {
        if (codes == null || codes.isEmpty()) {
            return List.of();
        }
        return selectExistingAttributeCodes(categoryId, codes.toArray(String[]::new));
    }

    @Select("SELECT code FROM catalog.attribute WHERE category_id = #{categoryId} AND code = ANY(#{codes})")
    List<String> selectExistingAttributeCodes(@Param("categoryId") UUID categoryId, @Param("codes") String[] codes);

    default void insert(
            UUID categoryId,
            List<String> identityKeys,
            List<String> skuIdentityKinds,
            List<String> matchStrategies,
            BrandPolicy brandPolicy,
            List<String> qualificationCodes,
            boolean autoApprove) {
        insertRow(
                categoryId,
                identityKeys.toArray(String[]::new),
                skuIdentityKinds.toArray(String[]::new),
                matchStrategies.toArray(String[]::new),
                brandPolicy,
                qualificationCodes.toArray(String[]::new),
                autoApprove);
    }

    /** text[] 列按 String[] 传（驱动按数组下发），枚举直接传对象（全局 DbEnumTypeHandler 转库值）。 */
    @Insert(
            """
            INSERT INTO catalog.category_config
                (category_id, identity_keys, sku_identity_kinds, match_strategies,
                 brand_policy, qualification_codes, auto_approve)
            VALUES (#{categoryId}, #{identityKeys}, #{skuIdentityKinds}, #{matchStrategies},
                    #{brandPolicy}, #{qualificationCodes}, #{autoApprove})
            """)
    void insertRow(
            @Param("categoryId") UUID categoryId,
            @Param("identityKeys") String[] identityKeys,
            @Param("skuIdentityKinds") String[] skuIdentityKinds,
            @Param("matchStrategies") String[] matchStrategies,
            @Param("brandPolicy") BrandPolicy brandPolicy,
            @Param("qualificationCodes") String[] qualificationCodes,
            @Param("autoApprove") boolean autoApprove);

    default boolean update(
            UUID categoryId,
            List<String> identityKeys,
            List<String> skuIdentityKinds,
            List<String> matchStrategies,
            BrandPolicy brandPolicy,
            List<String> qualificationCodes,
            boolean autoApprove) {
        return updateRow(
                        categoryId,
                        identityKeys.toArray(String[]::new),
                        skuIdentityKinds.toArray(String[]::new),
                        matchStrategies.toArray(String[]::new),
                        brandPolicy,
                        qualificationCodes.toArray(String[]::new),
                        autoApprove)
                == 1;
    }

    @Update(
            """
            UPDATE catalog.category_config
               SET identity_keys       = #{identityKeys},
                   sku_identity_kinds  = #{skuIdentityKinds},
                   match_strategies    = #{matchStrategies},
                   brand_policy        = #{brandPolicy},
                   qualification_codes = #{qualificationCodes},
                   auto_approve        = #{autoApprove}
             WHERE category_id = #{categoryId}
            """)
    int updateRow(
            @Param("categoryId") UUID categoryId,
            @Param("identityKeys") String[] identityKeys,
            @Param("skuIdentityKinds") String[] skuIdentityKinds,
            @Param("matchStrategies") String[] matchStrategies,
            @Param("brandPolicy") BrandPolicy brandPolicy,
            @Param("qualificationCodes") String[] qualificationCodes,
            @Param("autoApprove") boolean autoApprove);

    default void insertAttribute(
            UUID id,
            UUID categoryId,
            String code,
            String name,
            ValueType valueType,
            String unit,
            String optionsJson,
            boolean salesSpec,
            boolean required,
            boolean identity,
            boolean filterable,
            boolean multi,
            int sort) {
        insertAttributeRow(
                id,
                categoryId,
                code,
                name,
                valueType,
                unit,
                optionsJson,
                salesSpec,
                required,
                identity,
                filterable,
                multi,
                sort);
    }

    @Insert(
            """
            INSERT INTO catalog.attribute
                (id, category_id, code, name, value_type, unit, options, is_sales_spec, is_required,
                 is_identity, is_filterable, is_multi, status, sort)
            VALUES (#{id}, #{categoryId}, #{code}, #{name}, #{valueType}, #{unit}, CAST(#{options} AS jsonb),
                    #{salesSpec}, #{required}, #{identity}, #{filterable}, #{multi}, 'active', #{sort})
            """)
    void insertAttributeRow(
            @Param("id") UUID id,
            @Param("categoryId") UUID categoryId,
            @Param("code") String code,
            @Param("name") String name,
            @Param("valueType") ValueType valueType,
            @Param("unit") String unit,
            @Param("options") String optionsJson,
            @Param("salesSpec") boolean salesSpec,
            @Param("required") boolean required,
            @Param("identity") boolean identity,
            @Param("filterable") boolean filterable,
            @Param("multi") boolean multi,
            @Param("sort") int sort);

    /** category_config 的一行。text[] 列拿原文（{@code {"a","b"}}），解析见 {@link #parseArray}。 */
    record ConfigRow(
            UUID categoryId,
            String identityKeys,
            String skuIdentityKinds,
            String matchStrategies,
            BrandPolicy brandPolicy,
            String qualificationCodes,
            Boolean autoApprove,
            Instant createdAt,
            Instant updatedAt) {

        CategoryConfig toConfig(List<CategoryConfig.AttributeView> attributes) {
            return new CategoryConfig(
                    categoryId,
                    parseArray(identityKeys),
                    parseArray(skuIdentityKinds),
                    parseArray(matchStrategies),
                    brandPolicy.dbValue(),
                    parseArray(qualificationCodes),
                    Boolean.TRUE.equals(autoApprove),
                    attributes,
                    createdAt,
                    updatedAt);
        }
    }

    /** 属性行的库形状。列名用 AS 对齐 record 字段，因为库里带 {@code is_} 前缀。 */
    record AttributeRow(
            UUID id,
            UUID categoryId,
            String code,
            String name,
            ValueType valueType,
            String unit,
            String options,
            boolean salesSpec,
            boolean required,
            boolean identity,
            boolean filterable,
            boolean multi,
            String status,
            int sort) {

        CategoryConfig.AttributeView toView() {
            return new CategoryConfig.AttributeView(
                    id,
                    code,
                    name,
                    valueType.dbValue(),
                    unit,
                    parseJsonArray(options),
                    salesSpec,
                    required,
                    identity,
                    filterable,
                    multi,
                    status,
                    sort);
        }
    }

    /**
     * PG 的 {@code text[]} 读出来是 {@code {"a","b"}} 这种形状。
     *
     * <p>不用 {@code getArray()}：从 ResultSet 上取 Array 要手工释放，
     * 而这几列都是运营手工维护的短列表（值域、资质代码），字符串切一下就够。
     */
    static List<String> parseArray(String raw) {
        return splitWrapped(raw, '{', '}');
    }

    /** jsonb 数组读出来是 {@code ["a","b"]}。 */
    static List<String> parseJsonArray(String raw) {
        return splitWrapped(raw, '[', ']');
    }

    private static List<String> splitWrapped(String raw, char open, char close) {
        if (raw == null) {
            return List.of();
        }
        String body = raw.trim();
        if (body.length() < 2 || body.charAt(0) != open) {
            return List.of();
        }
        body = body.substring(1, body.length() - 1).trim();
        if (body.isEmpty()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (String part : body.split(",")) {
            String value = part.trim();
            if (value.length() >= 2 && value.charAt(0) == '"' && value.charAt(value.length() - 1) == '"') {
                value = value.substring(1, value.length() - 1);
            }
            if (!value.isEmpty()) {
                values.add(value);
            }
        }
        return List.copyOf(values);
    }
}
