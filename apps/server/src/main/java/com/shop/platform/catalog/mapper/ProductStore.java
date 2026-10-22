package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.dto.ProductDetail;
import com.shop.platform.catalog.model.ValueType;
import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
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
                (id, spu_type, merchant_id, category_id, brand_id, model_no, identity_kind, match_key, title)
            VALUES (:id, 'merchant', :merchantId, :categoryId, :brandId, :modelNo, :identityKind, :matchKey, :title)
            """;

    /**
     * 通用图（{@code attribute_id IS NULL}）与规格图是同一张表。
     *
     * <p>为什么不在 spu 上留一个 jsonb 数组：一张连衣裙 8 色 × 5 码 = 40 个 SKU，但图只有 8 套。
     * 图必须能挂到规格值上（选"红"就换图），而 jsonb 数组表达不了这件事——它只能挂 SPU 级通用图。
     * 两处都能存图，就一定会出现"通用图对了、规格图空着"或"两边对不上"。
     */
    private static final String INSERT_MEDIA =
            """
            INSERT INTO catalog.spu_media (id, spu_id, attribute_id, spec_value, url, media_type, sort)
            VALUES (:id, :spuId, NULL, NULL, :url, 'image', :sort)
            """;

    private static final String INSERT_SKU =
            """
            INSERT INTO catalog.sku
                (id, spu_id, spec_values, spec_key, price_amount, price_currency, weight_g, status)
            VALUES (:id, :spuId, CAST(:specs AS jsonb), :specKey, :priceAmount, :priceCurrency, :weightG, 'active')
            """;

    /**
     * 按属性类型写进对应的值列。
     *
     * <p><b>三个值列不是可选的装饰。</b> 原来这里写死 {@code value_text}，于是
     * {@code value_num} / {@code value_bool} 永远是 NULL，而它们一空：
     *
     * <ul>
     *   <li>{@code attribute.unit} 变成摆设——"1" 和 "100" 都只是文本，单位丢了，1m 和 100cm 是两个值
     *   <li>{@code idx_spu_attr_num} / {@code idx_spu_attr_bool} 两条索引扫不到任何行，筛选面板按数字筛不了
     *   <li>参数哈希拼不对：哈希要的是规范化后的值 + 单位，而文本里没有单位
     * </ul>
     *
     * <p>{@code ck_spu_attr_one_value} 强制三列恰好一个非空，所以这里必须按类型分派，
     * 而不是"能塞 text 就塞 text"。
     */
    private static final String INSERT_ATTR =
            """
            INSERT INTO catalog.spu_attr (spu_id, attribute_id, value_index, value_text, value_num, value_bool)
            VALUES (:spuId, :attributeId, 0, :valueText, CAST(:valueNum AS numeric), CAST(:valueBool AS boolean))
            """;

    private static final String FIND_FOR_PUBLISH =
            """
            SELECT merchant_id, category_id, brand_id
              FROM catalog.spu
             WHERE id = :spuId AND spu_type = 'merchant'
            """;

    private static final String SKU_IDS = "SELECT id FROM catalog.sku WHERE spu_id = :spuId";

    private final JdbcClient jdbc;

    private final ObjectMapper json = JsonMapper.builder().build();

    public ProductStore(JdbcClient jdbc) {
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
        jdbc.sql(INSERT_SPU)
                .param("id", spuId)
                .param("merchantId", merchantId)
                .param("categoryId", categoryId)
                .param("brandId", brandId)
                .param("modelNo", modelNo)
                .param("identityKind", identityKind)
                .param("matchKey", modelNo)
                .param("title", title)
                .update();
        insertGenericImages(spuId, images);
    }

    /** 通用图（不挂规格值）。商家发品时给的那批图都是通用图。 */
    private void insertGenericImages(UUID spuId, List<String> images) {
        if (images == null || images.isEmpty()) {
            return;
        }
        int sort = 0;
        for (String url : images) {
            if (url == null || url.isBlank()) {
                continue;
            }
            jdbc.sql(INSERT_MEDIA)
                    .param("id", Ids.newId())
                    .param("spuId", spuId)
                    .param("url", url)
                    .param("sort", sort++)
                    .update();
        }
    }

    public void insertSku(UUID skuId, UUID spuId, Map<UUID, String> specs, Money price, Integer weightG) {
        jdbc.sql(INSERT_SKU)
                .param("id", skuId)
                .param("spuId", spuId)
                .param("specs", writeJson(specs))
                .param("specKey", specKey(specs))
                .param("priceAmount", price.amount())
                .param("priceCurrency", price.currency())
                .param("weightG", weightG)
                .update();
    }

    /**
     * 按属性类型写进对应的值列。调用方已经从类目配置拿到了 {@code valueType}，
     * 这里不做类型推断——推断等于把"这个属性是什么类型"变成两处判断。
     *
     * @param valueType text / number / enum / bool
     * @throws IllegalArgumentException 数字或布尔解析不了。这是调用方的错，
     *     应该在发布闸门里被拦住，不该到这一层
     */
    public void insertAttribute(UUID spuId, UUID attributeId, ValueType valueType, String value) {
        String valueText = null;
        String valueNum = null;
        String valueBool = null;
        switch (valueType) {
            case NUMBER -> valueNum = value;
            case BOOL -> valueBool = value;
            default -> valueText = value;
        }
        jdbc.sql(INSERT_ATTR)
                .param("spuId", spuId)
                .param("attributeId", attributeId)
                .param("valueText", valueText)
                .param("valueNum", valueNum)
                .param("valueBool", valueBool)
                .update();
    }

    public Optional<PublishRow> findForPublish(UUID spuId) {
        return jdbc.sql(FIND_FOR_PUBLISH)
                .param("spuId", spuId)
                .query((rs, row) -> new PublishRow(
                        rs.getObject("merchant_id", UUID.class),
                        rs.getObject("category_id", UUID.class),
                        rs.getObject("brand_id", UUID.class)))
                .optional();
    }

    public List<UUID> skuIds(UUID spuId) {
        return jdbc.sql(SKU_IDS).param("spuId", spuId).query(UUID.class).list();
    }

    /**
     * 买家看到的商品详情。
     *
     * <p><b>三张表在同一个事务里读，不分开查。</b> 分开查的窗口里商家可能改价或下架，
     * 拼出来的详情就是"标题是新的、价格是旧的"这种不存在的组合。
     * 调用方在事务外调它，所以这里显式用 {@code READ COMMITTED} 的单语句读三张表——
     * PostgreSQL 的单条语句拿的是同一个快照。
     *
     * <p>具体做法是一次查询 + 两次数组成员：属性用 {@code jsonb_agg} 聚成数组，
     * SKU 也聚成数组。三个数组由同一条语句产出，快照必然一致。
     */
    private static final String FIND_DETAIL =
            """
            SELECT s.id,
                   s.title,
                   s.category_id,
                   s.brand_id,
                   COALESCE((
                       SELECT jsonb_agg(m.url ORDER BY m.sort, m.created_at)
                         FROM catalog.spu_media m
                        WHERE m.spu_id = s.id
                          AND m.attribute_id IS NULL
                          AND m.media_type = 'image'
                   ), '[]'::jsonb) AS images,
                   COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                                  'code', a.code,
                                  'value', COALESCE(sa.value_text, sa.value_num::text, sa.value_bool::text)))
                         FROM catalog.spu_attr sa
                         JOIN catalog.attribute a ON a.id = sa.attribute_id
                        WHERE sa.spu_id = s.id
                   ), '[]'::jsonb) AS attributes,
                   COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                                  'id', k.id,
                                  'specValues', CAST(k.spec_values AS text),
                                  'priceAmount', k.price_amount,
                                  'priceCurrency', k.price_currency)
                              ORDER BY k.price_amount)
                         FROM catalog.sku k
                        WHERE k.spu_id = s.id AND k.status = 'active'
                   ), '[]'::jsonb) AS skus
              FROM catalog.spu s
             WHERE s.id = :spuId
               AND EXISTS (
                   SELECT 1 FROM catalog.offer o
                    WHERE o.spu_id = s.id AND o.status = 'online'
               )
            """;

    public Optional<ProductDetail> findOnlineDetail(UUID spuId) {
        return jdbc.sql(FIND_DETAIL)
                .param("spuId", spuId)
                .query((rs, row) -> {
                    List<ProductDetail.AttributeView> attributes = readAttributes(rs.getString("attributes"));
                    List<ProductDetail.SkuView> skus = readSkus(rs.getString("skus"));
                    Money minPrice = skus.stream()
                            .map(ProductDetail.SkuView::price)
                            .min(Comparator.comparingLong(Money::amount))
                            .orElse(Money.cny(0));
                    return new ProductDetail(
                            rs.getObject("id", UUID.class),
                            rs.getString("title"),
                            rs.getObject("category_id", UUID.class),
                            rs.getObject("brand_id", UUID.class),
                            readStringList(rs.getString("images")),
                            attributes,
                            skus,
                            minPrice);
                })
                .optional();
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

    private List<ProductDetail.AttributeView> readAttributes(String raw) {
        List<AttrJson> parsed = json.readValue(raw, new TypeReference<ArrayList<AttrJson>>() {});
        if (parsed == null) {
            return List.of();
        }
        return parsed.stream()
                .map(item -> new ProductDetail.AttributeView(item.code(), item.value()))
                .toList();
    }

    private List<ProductDetail.SkuView> readSkus(String raw) {
        List<SkuJson> parsed = json.readValue(raw, new TypeReference<ArrayList<SkuJson>>() {});
        if (parsed == null) {
            return List.of();
        }
        return parsed.stream()
                .map(item -> new ProductDetail.SkuView(
                        item.id(), readSpecs(item.specValues()), new Money(item.priceAmount(), item.priceCurrency())))
                .toList();
    }

    private Map<String, String> readSpecs(String raw) {
        if (raw == null || raw.isBlank()) {
            return Map.of();
        }
        Map<String, String> parsed = json.readValue(raw, new TypeReference<LinkedHashMap<String, String>>() {});
        return parsed == null ? Map.of() : Map.copyOf(parsed);
    }

    private List<String> readStringList(String raw) {
        List<String> parsed = json.readValue(raw, new TypeReference<ArrayList<String>>() {});
        return parsed == null ? List.of() : List.copyOf(parsed);
    }

    public record PublishRow(UUID merchantId, UUID categoryId, UUID brandId) {}

    private record AttrJson(String code, String value) {}

    private record SkuJson(UUID id, String specValues, long priceAmount, String priceCurrency) {}
}
