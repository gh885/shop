package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.dto.ProductDetail;
import com.shop.platform.catalog.model.IdentityKind;
import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import com.shop.platform.infra.db.JsonColumns;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import tools.jackson.core.type.TypeReference;

/**
 * SPU 的写侧与买家详情的快照读。
 *
 * <p>规格值用 jsonb 存、用 spec_key 兜唯一性；spec_key 在服务端按 attributeId 排序后拼，
 * 客户端传参顺序不参与。
 */
@Mapper
public interface SpuMapper {

    /**
     * 建 SPU。识别键由调用方（{@link com.shop.platform.catalog.service.IdentityKeyResolver}）算好传入——
     * 这里不猜，猜了就等于把"怎么认商品"变成两处判断。
     */
    @Insert(
            """
            INSERT INTO catalog.spu
                (id, spu_type, merchant_id, category_id, brand_id, model_no,
                 identity_kind, match_key, title)
            VALUES (#{id}, 'merchant', #{merchantId}, #{categoryId}, #{brandId}, #{modelNo},
                    #{identityKind}, #{matchKey}, #{title})
            """)
    void insertSpu(
            @Param("id") UUID spuId,
            @Param("merchantId") UUID merchantId,
            @Param("categoryId") UUID categoryId,
            @Param("brandId") UUID brandId,
            @Param("title") String title,
            @Param("modelNo") String modelNo,
            @Param("identityKind") IdentityKind identityKind,
            @Param("matchKey") String matchKey);

    /**
     * 标准品的懒建。{@code ON CONFLICT DO NOTHING} 而不是"先查再插"：
     *
     * <p>两个商家同时发布同款时会双双查不到、双双插入，后一个撞
     * {@code uq_spu_standard_match} 抛 {@code DuplicateKeyException}——而 PostgreSQL 里
     * 这个异常会<b>终止整个事务</b>，之后的语句全部报 {@code current transaction is aborted}，
     * 连回滚都做不干净。所以并发这条路不能靠 catch。
     *
     * <p>{@code ON CONFLICT} 在 PostgreSQL 走推测插入，会等并发的那一笔：对方回滚 → 我插进去；
     * 对方提交 → 我 DO NOTHING。所以 RETURNING 拿到 0 行时，那个标准品一定已经提交，
     * 紧接着的 SELECT 必然找得到——不需要重试，也不会抛异常。
     *
     * <p>{@code WHERE spu_type = 'standard'} 是偏索引的谓词，必须和索引定义一致，
     * 否则 PostgreSQL 推断不出冲突目标。
     */
    @Select(
            """
            INSERT INTO catalog.spu
                (id, spu_type, merchant_id, category_id, brand_id, model_no,
                 identity_kind, match_key, title)
            VALUES (#{id}, 'standard', NULL, #{categoryId}, #{brandId}, #{modelNo},
                    #{identityKind}, #{matchKey}, #{title})
            ON CONFLICT (identity_kind, match_key) WHERE spu_type = 'standard'
            DO NOTHING
            RETURNING id
            """)
    UUID insertStandardReturningId(
            @Param("id") UUID id,
            @Param("categoryId") UUID categoryId,
            @Param("brandId") UUID brandId,
            @Param("modelNo") String modelNo,
            @Param("identityKind") IdentityKind identityKind,
            @Param("matchKey") String matchKey,
            @Param("title") String title);

    @Select(
            """
            SELECT id FROM catalog.spu
             WHERE spu_type = 'standard' AND identity_kind = #{identityKind} AND match_key = #{matchKey}
            """)
    UUID findStandardId(@Param("identityKind") IdentityKind identityKind, @Param("matchKey") String matchKey);

    /**
     * 找到标准品，没有就建一个。返回标准品 id。
     *
     * <p><b>标准品是懒建的，没有独立的创建入口。</b> 第一个发布到这个识别键的商家顺手把它建出来，
     * 后来的人直接挂上。理由：平台预建 10 万条标准品的成本远高于让第一条商品带出来，
     * 而"没有标准品"本身不阻塞任何事——挂不上只是归并少一组。
     *
     * @param title 只有真的插进去时才会被用上。已存在时标题以库里那条为准
     *     （先来者定名），商家 SPU 的标题不会覆盖它
     */
    default UUID findOrCreateStandard(
            UUID categoryId, UUID brandId, String modelNo, IdentityKind identityKind, String matchKey, String title) {
        Objects.requireNonNull(matchKey, "matchKey");
        UUID standardId = Ids.newId();
        UUID inserted =
                insertStandardReturningId(standardId, categoryId, brandId, modelNo, identityKind, matchKey, title);
        if (inserted != null) {
            return standardId;
        }
        return findStandardId(identityKind, matchKey);
    }

    /** 把商家 SPU 挂到标准品上。重复挂同一行是幂等的——同样的两个值再写一遍没差别。 */
    @Update(
            """
            UPDATE catalog.spu
               SET standard_spu_id = #{standardSpuId}, standard_matched_by = #{matchedBy}
             WHERE id = #{spuId}
            """)
    void linkStandard(
            @Param("spuId") UUID spuId,
            @Param("standardSpuId") UUID standardSpuId,
            @Param("matchedBy") String matchedBy);

    /** 发布前点查：只认商家 SPU（standard 行没有归属商家，不能挂售）。 */
    @Select(
            """
            SELECT merchant_id AS merchantId, category_id AS categoryId, brand_id AS brandId
              FROM catalog.spu
             WHERE id = #{spuId} AND spu_type = 'merchant'
            """)
    Optional<PublishRow> findForPublish(@Param("spuId") UUID spuId);

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
    default Optional<ProductDetail> findOnlineDetail(UUID spuId) {
        return findDetailRow(spuId).map(DetailRow::toDetail);
    }

    @Select(
            """
            SELECT s.id,
                   s.title,
                   s.category_id AS categoryId,
                   s.brand_id    AS brandId,
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
             WHERE s.id = #{spuId}
               AND EXISTS (
                   SELECT 1 FROM catalog.listing o
                    WHERE o.spu_id = s.id AND o.status = 'online'
               )
            """)
    Optional<DetailRow> findDetailRow(@Param("spuId") UUID spuId);

    /** 不暴露给调用方；只用于 spec_key 的稳定拼接。 */
    static String specKey(Map<UUID, String> specs) {
        return specs.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .reduce((left, right) -> left + "|" + right)
                .orElseThrow(() -> new IllegalArgumentException("规格不能为空"));
    }

    /** 发布前点查的一行（merchant/category/brand）。 */
    record PublishRow(UUID merchantId, UUID categoryId, UUID brandId) {}

    /**
     * 买家详情的一行。images/attributes/skus 三个 jsonb 数组由同一条语句产出，快照必然一致；
     * 解析成 {@link ProductDetail} 见 {@link #toDetail()}。
     */
    record DetailRow(
            UUID id, String title, UUID categoryId, UUID brandId, String images, String attributes, String skus) {

        ProductDetail toDetail() {
            List<ProductDetail.AttributeView> parsedAttributes = readAttributes(attributes);
            List<ProductDetail.SkuView> parsedSkus = readSkus(skus);
            Money minPrice = parsedSkus.stream()
                    .map(ProductDetail.SkuView::price)
                    .min(Comparator.comparingLong(Money::amount))
                    .orElse(Money.cny(0));
            return new ProductDetail(
                    id,
                    title,
                    categoryId,
                    brandId,
                    JsonColumns.readStringList(images),
                    parsedAttributes,
                    parsedSkus,
                    minPrice);
        }

        private List<ProductDetail.AttributeView> readAttributes(String raw) {
            List<AttrJson> parsed = JsonColumns.read(raw, new TypeReference<List<AttrJson>>() {});
            if (parsed == null) {
                return List.of();
            }
            return parsed.stream()
                    .map(item -> new ProductDetail.AttributeView(item.code(), item.value()))
                    .toList();
        }

        private List<ProductDetail.SkuView> readSkus(String raw) {
            List<SkuJson> parsed = JsonColumns.read(raw, new TypeReference<List<SkuJson>>() {});
            if (parsed == null) {
                return List.of();
            }
            return parsed.stream()
                    .map(item -> new ProductDetail.SkuView(
                            item.id(),
                            readSpecs(item.specValues()),
                            new Money(item.priceAmount(), item.priceCurrency())))
                    .toList();
        }

        private Map<String, String> readSpecs(String raw) {
            if (raw == null || raw.isBlank()) {
                return Map.of();
            }
            Map<String, String> parsed = JsonColumns.read(raw, new TypeReference<Map<String, String>>() {});
            return parsed == null ? Map.of() : Map.copyOf(parsed);
        }

        private record AttrJson(String code, String value) {}

        private record SkuJson(UUID id, String specValues, long priceAmount, String priceCurrency) {}
    }
}
