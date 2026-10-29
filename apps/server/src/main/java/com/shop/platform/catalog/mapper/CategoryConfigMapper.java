package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.model.BrandPolicy;
import com.shop.platform.catalog.model.CategoryConfig;
import com.shop.platform.catalog.model.ValueType;
import com.shop.platform.infra.db.JsonColumns;
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
import tools.jackson.core.type.TypeReference;

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
            SELECT a.id, a.category_id AS categoryId, a.code, a.name, a.value_type AS valueType, a.unit,
                   a.allow_custom AS allowCustom,
                   a.is_sales_spec AS salesSpec,
                   a.is_required   AS required,
                   a.is_identity   AS identity,
                   a.is_filterable AS filterable,
                   a.is_multi      AS multi,
                   a.status, a.sort,
                   a.visible_when::text AS "visibleWhen",
                   COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                                  'id', v.id,
                                  'value', v.value,
                                  'imageUrl', v.image_url,
                                  'sort', v.sort,
                                  'source', v.source,
                                  'status', v.status)
                              ORDER BY v.sort, v.created_at)
                         FROM catalog.attribute_value v
                        WHERE v.attribute_id = a.id
                   ), '[]'::jsonb) AS "values"
              FROM catalog.attribute a
             WHERE a.category_id = #{categoryId}
             ORDER BY a.sort, a.code
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
            boolean allowCustom,
            boolean salesSpec,
            boolean required,
            boolean identity,
            boolean filterable,
            boolean multi,
            int sort,
            String visibleWhen) {
        insertAttributeRow(
                id,
                categoryId,
                code,
                name,
                valueType,
                unit,
                allowCustom,
                salesSpec,
                required,
                identity,
                filterable,
                multi,
                sort,
                visibleWhen);
    }

    @Insert(
            """
            INSERT INTO catalog.attribute
                (id, category_id, code, name, value_type, unit, allow_custom, is_sales_spec, is_required,
                 is_identity, is_filterable, is_multi, status, sort, visible_when)
            VALUES (#{id}, #{categoryId}, #{code}, #{name}, #{valueType}, #{unit}, #{allowCustom},
                    #{salesSpec}, #{required}, #{identity}, #{filterable}, #{multi}, 'active', #{sort},
                    CAST(#{visibleWhen} AS jsonb))
            """)
    void insertAttributeRow(
            @Param("id") UUID id,
            @Param("categoryId") UUID categoryId,
            @Param("code") String code,
            @Param("name") String name,
            @Param("valueType") ValueType valueType,
            @Param("unit") String unit,
            @Param("allowCustom") boolean allowCustom,
            @Param("salesSpec") boolean salesSpec,
            @Param("required") boolean required,
            @Param("identity") boolean identity,
            @Param("filterable") boolean filterable,
            @Param("multi") boolean multi,
            @Param("sort") int sort,
            @Param("visibleWhen") String visibleWhen);

    /** 值字典：创建不改名，只追加。{@code ON CONFLICT DO NOTHING} 让并发追加不炸事务。 */
    @Insert(
            """
            INSERT INTO catalog.attribute_value (id, attribute_id, value, image_url, sort, source)
            VALUES (#{id}, #{attributeId}, #{value}, #{imageUrl}, #{sort}, #{source})
            ON CONFLICT DO NOTHING
            """)
    void insertValue(
            @Param("id") UUID id,
            @Param("attributeId") UUID attributeId,
            @Param("value") String value,
            @Param("imageUrl") String imageUrl,
            @Param("sort") int sort,
            @Param("source") String source);

    default void ensureSellerValue(UUID attributeId, String value) {
        insertValue(com.shop.platform.common.id.Ids.newId(), attributeId, value, null, 0, "seller");
    }

    /** 值文本不可改；只改图片、排序、启停。 */
    @Update(
            """
            UPDATE catalog.attribute_value
               SET image_url = COALESCE(#{imageUrl}, image_url),
                   sort      = COALESCE(#{sort}, sort),
                   status    = COALESCE(#{status}, status)
             WHERE id = #{valueId} AND attribute_id = #{attributeId}
            """)
    int updateValue(
            @Param("attributeId") UUID attributeId,
            @Param("valueId") UUID valueId,
            @Param("imageUrl") String imageUrl,
            @Param("sort") Integer sort,
            @Param("status") String status);

    @Select(
            """
            SELECT id, attribute_id AS attributeId, value, image_url AS imageUrl,
                   sort, source, status
              FROM catalog.attribute_value
             WHERE id = #{valueId} AND attribute_id = #{attributeId}
            """)
    Optional<ValueRow> findValue(@Param("attributeId") UUID attributeId, @Param("valueId") UUID valueId);

    /**
     * 改属性模板里可以安全修改的元数据。{@code value_type} / {@code unit} / {@code options} /
     * {@code is_identity} / {@code is_sales_spec} 不在可改范围——它们改的是身份键和 SKU 维度，
     * 不是「运营打错了一个字」。
     *
     * <p>条件里带 {@code category_id}，防止用一个类目的路径改到另一个类目的属性。
     */
    @Update(
            """
            UPDATE catalog.attribute
               SET name       = #{name},
                   is_required = #{required},
                   is_filterable = #{filterable},
                   is_multi   = #{multi},
                   allow_custom = #{allowCustom},
                   status     = #{status},
                   sort       = #{sort},
                   visible_when = CAST(#{visibleWhen} AS jsonb)
             WHERE id = #{attributeId} AND category_id = #{categoryId}
            """)
    int updateAttribute(
            @Param("categoryId") UUID categoryId,
            @Param("attributeId") UUID attributeId,
            @Param("name") String name,
            @Param("required") boolean required,
            @Param("filterable") boolean filterable,
            @Param("multi") boolean multi,
            @Param("allowCustom") boolean allowCustom,
            @Param("status") String status,
            @Param("sort") int sort,
            @Param("visibleWhen") String visibleWhen);

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
            boolean allowCustom,
            boolean salesSpec,
            boolean required,
            boolean identity,
            boolean filterable,
            boolean multi,
            String status,
            int sort,
            String visibleWhen,
            String values) {

        CategoryConfig.AttributeView toView() {
            List<CategoryConfig.AttributeValueView> parsedValues = parseValues(values);
            List<String> options = parsedValues.stream()
                    .filter(value -> "active".equals(value.status()))
                    .map(CategoryConfig.AttributeValueView::value)
                    .toList();
            return new CategoryConfig.AttributeView(
                    id,
                    code,
                    name,
                    valueType.dbValue(),
                    unit,
                    options,
                    parsedValues,
                    allowCustom,
                    salesSpec,
                    required,
                    identity,
                    filterable,
                    multi,
                    status,
                    sort,
                    parseVisibleWhen(visibleWhen));
        }
    }

    record ValueRow(UUID id, UUID attributeId, String value, String imageUrl, int sort, String source, String status) {}

    private static CategoryConfig.VisibleWhen parseVisibleWhen(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return JsonColumns.read(raw, new TypeReference<CategoryConfig.VisibleWhen>() {});
    }

    private static List<CategoryConfig.AttributeValueView> parseValues(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        List<ValueJson> parsed = JsonColumns.read(raw, new TypeReference<List<ValueJson>>() {});
        if (parsed == null) {
            return List.of();
        }
        return parsed.stream()
                .map(item -> new CategoryConfig.AttributeValueView(
                        item.id(), item.value(), item.imageUrl(), item.sort(), item.source(), item.status()))
                .toList();
    }

    record ValueJson(UUID id, String value, String imageUrl, int sort, String source, String status) {}

    /**
     * PG 的 {@code text[]} 读出来是 {@code {"a","b"}} 这种形状。
     *
     * <p><b>按 PG 数组字面量解析，不按逗号裸切。</b> 值本身带逗号时（例如枚举选项
     * {@code "USB-C, 3A"}），裸切会把它拆成两个值，而发布闸门随后会拒绝一个合法的取值。
     */
    static List<String> parseArray(String raw) {
        if (raw == null) {
            return List.of();
        }
        String body = raw.trim();
        if (body.length() < 2 || body.charAt(0) != '{') {
            return List.of();
        }
        body = body.substring(1, body.length() - 1);
        if (body.isBlank()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < body.length(); i++) {
            char c = body.charAt(i);
            if (quoted) {
                if (c == '\\' && i + 1 < body.length()) {
                    current.append(body.charAt(++i));
                } else if (c == '"') {
                    quoted = false;
                } else {
                    current.append(c);
                }
            } else if (c == '"') {
                quoted = true;
            } else if (c == ',') {
                addArrayValue(values, current);
            } else {
                current.append(c);
            }
        }
        addArrayValue(values, current);
        return List.copyOf(values);
    }

    private static void addArrayValue(List<String> values, StringBuilder current) {
        String value = current.toString().trim();
        current.setLength(0);
        if (!value.isEmpty()) {
            values.add(value);
        }
    }
}
