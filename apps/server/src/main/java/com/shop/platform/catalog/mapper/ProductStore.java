package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.dto.ProductDetail;
import com.shop.platform.common.money.Money;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 商品写侧与买家详情的 SQL。
 *
 * <p>规格值用 jsonb 存、用 spec_key 兜唯一性；spec_key 在服务端按 attributeId 排序后拼，
 * 客户端传参顺序不参与。
 */
@Component
public class ProductStore {

    private static final String INSERT_SPU =
            """
            INSERT INTO catalog.spu
                (id, spu_type, merchant_id, category_id, brand_id, model_no,
                 identity_kind, match_key, title, images, status)
            VALUES (?, 'merchant', ?, ?, ?, ?, ?, ?, ?, ?::jsonb, 'draft')
            """;

    private static final String INSERT_SKU =
            """
            INSERT INTO catalog.sku
                (id, spu_id, spec_values, spec_key, price_amount, price_currency, weight_g, status)
            VALUES (?, ?, ?::jsonb, ?, ?, ?, ?, 'active')
            """;

    private static final String INSERT_ATTR =
            """
            INSERT INTO catalog.spu_attr (spu_id, attribute_id, value_index, value_text)
            VALUES (?, ?, 0, ?)
            """;

    private static final String FIND_FOR_PUBLISH =
            """
            SELECT merchant_id, category_id, brand_id
              FROM catalog.spu
             WHERE id = ? AND spu_type = 'merchant'
            """;

    private static final String SKU_IDS = "SELECT id FROM catalog.sku WHERE spu_id = ?";

    private static final String UPDATE_SPU_STATUS = "UPDATE catalog.spu SET status = ? WHERE id = ?";

    private static final String FIND_ONLINE_SPU =
            """
            SELECT s.id, s.title, s.category_id, s.brand_id, s.images::text AS images
              FROM catalog.spu s
             WHERE s.id = ?
               AND EXISTS (
                   SELECT 1 FROM catalog.offer o
                    WHERE o.spu_id = s.id AND o.status = 'online'
               )
            """;

    private static final String FIND_ATTRIBUTES =
            """
            SELECT a.code, sa.value_text
              FROM catalog.spu_attr sa
              JOIN catalog.attribute a ON a.id = sa.attribute_id
             WHERE sa.spu_id = ? AND sa.value_text IS NOT NULL
             ORDER BY a.code
            """;

    private static final String FIND_SKUS =
            """
            SELECT id, spec_values::text AS spec_values, price_amount, price_currency
              FROM catalog.sku
             WHERE spu_id = ? AND status = 'active'
             ORDER BY price_amount
            """;

    private final JdbcTemplate jdbc;

    private final ObjectMapper json = JsonMapper.builder().build();

    public ProductStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insertSpu(
            UUID spuId,
            UUID merchantId,
            UUID categoryId,
            UUID brandId,
            String title,
            String modelNo,
            List<String> images) {
        String identityKind = modelNo == null || modelNo.isBlank() ? "none" : "model_no";
        jdbc.update(
                INSERT_SPU,
                spuId,
                merchantId,
                categoryId,
                brandId,
                modelNo,
                identityKind,
                modelNo,
                title,
                writeJson(images == null ? List.of() : images));
    }

    public void insertSku(UUID skuId, UUID spuId, Map<UUID, String> specs, Money price, Integer weightG) {
        jdbc.update(
                INSERT_SKU, skuId, spuId, writeJson(specs), specKey(specs), price.amount(), price.currency(), weightG);
    }

    public void insertAttribute(UUID spuId, UUID attributeId, String value) {
        jdbc.update(INSERT_ATTR, spuId, attributeId, value);
    }

    public Optional<PublishRow> findForPublish(UUID spuId) {
        List<PublishRow> rows = jdbc.query(
                FIND_FOR_PUBLISH,
                (rs, row) -> new PublishRow(
                        rs.getObject("merchant_id", UUID.class),
                        rs.getObject("category_id", UUID.class),
                        rs.getObject("brand_id", UUID.class)),
                spuId);
        return rows.stream().findFirst();
    }

    public List<UUID> skuIds(UUID spuId) {
        return jdbc.queryForList(SKU_IDS, UUID.class, spuId);
    }

    public void updateSpuStatus(UUID spuId, String status) {
        jdbc.update(UPDATE_SPU_STATUS, status, spuId);
    }

    public Optional<ProductDetail> findOnlineDetail(UUID spuId) {
        List<SpuRow> spus = jdbc.query(
                FIND_ONLINE_SPU,
                (rs, row) -> new SpuRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("title"),
                        rs.getObject("category_id", UUID.class),
                        rs.getObject("brand_id", UUID.class),
                        rs.getString("images")),
                spuId);
        if (spus.isEmpty()) {
            return Optional.empty();
        }

        SpuRow spu = spus.getFirst();
        List<ProductDetail.AttributeView> attributes = jdbc.query(
                FIND_ATTRIBUTES,
                (rs, row) -> new ProductDetail.AttributeView(rs.getString("code"), rs.getString("value_text")),
                spuId);
        List<ProductDetail.SkuView> skus = jdbc.query(
                FIND_SKUS,
                (rs, row) -> new ProductDetail.SkuView(
                        rs.getObject("id", UUID.class),
                        readSpecs(rs.getString("spec_values")),
                        new Money(rs.getLong("price_amount"), rs.getString("price_currency"))),
                spuId);

        Money minPrice = skus.stream()
                .map(ProductDetail.SkuView::price)
                .min(Comparator.comparingLong(Money::amount))
                .orElse(Money.cny(0));

        return Optional.of(new ProductDetail(
                spu.id(),
                spu.title(),
                spu.categoryId(),
                spu.brandId(),
                readStringList(spu.images()),
                attributes,
                skus,
                minPrice));
    }

    /** 不暴露给调用方；只用于 spec_key 的稳定拼接。 */
    public static String specKey(Map<UUID, String> specs) {
        return specs.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .reduce((left, right) -> left + "|" + right)
                .orElseThrow(() -> new IllegalArgumentException("规格不能为空"));
    }

    private String writeJson(Object value) {
        return json.writeValueAsString(value);
    }

    private Map<String, String> readSpecs(String raw) {
        Map<String, String> parsed = json.readValue(raw, new TypeReference<LinkedHashMap<String, String>>() {});
        return parsed == null ? Map.of() : Map.copyOf(parsed);
    }

    private List<String> readStringList(String raw) {
        List<String> parsed = json.readValue(raw, new TypeReference<ArrayList<String>>() {});
        return parsed == null ? List.of() : List.copyOf(parsed);
    }

    public record PublishRow(UUID merchantId, UUID categoryId, UUID brandId) {}

    private record SpuRow(UUID id, String title, UUID categoryId, UUID brandId, String images) {}
}
