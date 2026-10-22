package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.model.BrandPolicy;
import com.shop.platform.catalog.model.CategoryConfig;
import com.shop.platform.catalog.model.ValueType;
import com.shop.platform.infra.db.RowMappers;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 类目配置的读写。<b>只对叶子类目存在</b>，一行一个类目。
 *
 * <p>没有继承、没有沿链合并。读一个叶子的配置就是一条 {@code WHERE category_id = ?}——
 * "L1 配了会不会影响 L3"这个问题不存在，因为 L1 根本没有配置行。
 *
 * <p>属性模板也住这里（{@code catalog.attribute} 表），同样只挂叶子。
 */
@Component
public class CategoryConfigStore {

    private static final String FIND =
            """
            SELECT category_id, identity_keys, sku_identity_kinds, match_strategies,
                   brand_policy, qualification_codes, auto_approve, created_at, updated_at
              FROM catalog.category_config
             WHERE category_id = :categoryId
            """;

    private static final String INSERT =
            """
            INSERT INTO catalog.category_config
                (category_id, identity_keys, sku_identity_kinds, match_strategies,
                 brand_policy, qualification_codes, auto_approve)
            VALUES (:categoryId, :identityKeys, :skuIdentityKinds, :matchStrategies,
                    :brandPolicy, :qualificationCodes, :autoApprove)
            """;

    private static final String UPDATE =
            """
            UPDATE catalog.category_config
               SET identity_keys       = :identityKeys,
                   sku_identity_kinds  = :skuIdentityKinds,
                   match_strategies    = :matchStrategies,
                   brand_policy        = :brandPolicy,
                   qualification_codes = :qualificationCodes,
                   auto_approve        = :autoApprove
             WHERE category_id = :categoryId
            """;

    private static final String FIND_ATTRIBUTES =
            """
            SELECT id, category_id, code, name, value_type, unit, options,
                   is_sales_spec AS sales_spec,
                   is_required   AS required,
                   is_identity   AS identity,
                   is_filterable AS filterable,
                   is_multi      AS multi,
                   status, sort
              FROM catalog.attribute
             WHERE category_id = :categoryId
             ORDER BY sort, code
            """;

    private static final String INSERT_ATTRIBUTE =
            """
            INSERT INTO catalog.attribute
                (id, category_id, code, name, value_type, unit, options, is_sales_spec, is_required,
                 is_identity, is_filterable, is_multi, status, sort)
            VALUES (:id, :categoryId, :code, :name, :valueType, :unit, CAST(:options AS jsonb),
                    :salesSpec, :required, :identity, :filterable, :multi, 'active', :sort)
            """;

    private static final String ATTRIBUTE_CODES_EXIST =
            """
            SELECT code FROM catalog.attribute
             WHERE category_id = :categoryId AND code = ANY(:codes)
            """;

    private final JdbcClient jdbc;

    public CategoryConfigStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<CategoryConfig> find(UUID categoryId) {
        Optional<ConfigRow> found = jdbc.sql(FIND)
                .param("categoryId", categoryId)
                .query(RowMappers.of(ConfigRow.class))
                .optional();
        return found.map(row -> row.toConfig(attributes(categoryId)));
    }

    public List<CategoryConfig.AttributeView> attributes(UUID categoryId) {
        return jdbc
                .sql(FIND_ATTRIBUTES)
                .param("categoryId", categoryId)
                .query(RowMappers.of(AttributeRow.class))
                .list()
                .stream()
                .map(AttributeRow::toView)
                .toList();
    }

    public List<String> existingAttributeCodes(UUID categoryId, List<String> codes) {
        if (codes == null || codes.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(ATTRIBUTE_CODES_EXIST)
                .param("categoryId", categoryId)
                .param("codes", codes.toArray(String[]::new))
                .query(String.class)
                .list();
    }

    public void insert(
            UUID categoryId,
            List<String> identityKeys,
            List<String> skuIdentityKinds,
            List<String> matchStrategies,
            BrandPolicy brandPolicy,
            List<String> qualificationCodes,
            boolean autoApprove) {
        jdbc.sql(INSERT)
                .param("categoryId", categoryId)
                .param("identityKeys", identityKeys.toArray(String[]::new))
                .param("skuIdentityKinds", skuIdentityKinds.toArray(String[]::new))
                .param("matchStrategies", matchStrategies.toArray(String[]::new))
                .param("brandPolicy", brandPolicy.dbValue())
                .param("qualificationCodes", qualificationCodes.toArray(String[]::new))
                .param("autoApprove", autoApprove)
                .update();
    }

    public boolean update(
            UUID categoryId,
            List<String> identityKeys,
            List<String> skuIdentityKinds,
            List<String> matchStrategies,
            BrandPolicy brandPolicy,
            List<String> qualificationCodes,
            boolean autoApprove) {
        return jdbc.sql(UPDATE)
                        .param("categoryId", categoryId)
                        .param("identityKeys", identityKeys.toArray(String[]::new))
                        .param("skuIdentityKinds", skuIdentityKinds.toArray(String[]::new))
                        .param("matchStrategies", matchStrategies.toArray(String[]::new))
                        .param("brandPolicy", brandPolicy.dbValue())
                        .param("qualificationCodes", qualificationCodes.toArray(String[]::new))
                        .param("autoApprove", autoApprove)
                        .update()
                == 1;
    }

    public void insertAttribute(
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
        jdbc.sql(INSERT_ATTRIBUTE)
                .param("id", id)
                .param("categoryId", categoryId)
                .param("code", code)
                .param("name", name)
                .param("valueType", valueType.dbValue())
                .param("unit", unit)
                .param("options", optionsJson)
                .param("salesSpec", salesSpec)
                .param("required", required)
                .param("identity", identity)
                .param("filterable", filterable)
                .param("multi", multi)
                .param("sort", sort)
                .update();
    }

    private record ConfigRow(
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
    public record AttributeRow(
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
     * <p>不用 {@code getArray()}：JdbcClient 的 row mapper 拿到的 ResultSet 上取 Array 要手工释放，
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
