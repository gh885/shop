package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.dto.SellerProductDetail;
import com.shop.platform.catalog.dto.SpecImageView;
import com.shop.platform.common.money.Money;
import com.shop.platform.infra.db.JsonColumns;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import tools.jackson.core.type.TypeReference;

/**
 * 卖家侧商品详情：任何状态可读，含全部 SKU（含停售）与 listing 审核信息。
 *
 * <p><b>为什么和 {@link SpuMapper#findDetailRow} 分成两条 SQL。</b> 两边谓词相反：
 * 买家那条要 {@code EXISTS (listing.status = 'online')} 且只取 {@code sku.status = 'active'}；
 * 卖家这条一个状态条件都不能有——他必须看得见自己没上架的商品、和已经停售的 SKU，
 * 否则「我建了 5 个规格怎么只显示 3 个」根本无从排查。
 *
 * <p>把两条合成一条带 {@code <if>} 的 SQL，等于让「谁能看见什么」变成一个运行期参数，
 * 而这个参数一旦传错，泄露的是别人的草稿。
 */
@Mapper
public interface SellerProductReadMapper {

    /**
     * 一个 SPU 的卖家视图。
     *
     * <p><b>归属写进 SQL</b>（{@code s.merchant_id = #{merchantId}}），不是查出来再比对——
     * 后者每次新增一条读就多一个忘比对的机会（{@code DataScopeTest} 的类注释里写过同一条）。
     * 查不到就是 404，不是 403：403 本身就是「这个 id 存在」的确认。
     *
     * <p>三组数据（属性、SKU、listing）用子查询聚成 jsonb / 标量，一条语句产出同一快照——
     * 分开查的窗口里商家可能刚好改价，拼出来就是「标题是新的、价格是旧的」这种不存在的组合。
     *
     * <p>{@code LEFT JOIN listing} 而不是 JOIN：草稿还没提交过挂售，没有 listing 行，
     * 用 JOIN 会让草稿查不出来——而草稿正是最需要编辑的那个状态。
     */
    @Select(
            """
            SELECT s.id            AS spuId,
                   s.title         AS title,
                   s.subtitle      AS subtitle,
                   s.category_id   AS categoryId,
                   s.brand_id      AS brandId,
                   s.model_no      AS modelNo,
                   s.seven_day_return AS sevenDayReturn,
                   s.sold_count    AS soldCount,
                   COALESCE((
                       SELECT jsonb_agg(m.url ORDER BY m.sort, m.created_at)
                         FROM catalog.spu_media m
                        WHERE m.spu_id = s.id
                          AND m.attribute_id IS NULL
                          AND m.media_type = 'image'
                   ), '[]'::jsonb) AS images,
                   COALESCE((
                       SELECT jsonb_agg(m.url ORDER BY m.sort, m.created_at)
                         FROM catalog.spu_media m
                        WHERE m.spu_id = s.id
                          AND m.attribute_id IS NULL
                          AND m.media_type = 'detail'
                   ), '[]'::jsonb) AS detailImages,
                   COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                                  'attributeId', sa.attribute_id,
                                  'code', a.code,
                                  'name', a.name,
                                  'value', COALESCE(sa.value_text, sa.value_num::text, sa.value_bool::text))
                              ORDER BY a.code, sa.value_index)
                         FROM catalog.spu_attr sa
                         JOIN catalog.attribute a ON a.id = sa.attribute_id
                        WHERE sa.spu_id = s.id
                   ), '[]'::jsonb) AS attributes,
                   COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                                  'attributeId', m.attribute_id,
                                  'value', m.spec_value,
                                  'imageUrl', m.url)
                              ORDER BY m.attribute_id, m.spec_value, m.sort)
                         FROM catalog.spu_media m
                        WHERE m.spu_id = s.id
                          AND m.attribute_id IS NOT NULL
                   ), '[]'::jsonb) AS specImages,
                   COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                                  'skuId', k.id,
                                  'specValues', CAST(k.spec_values AS text),
                                  'priceAmount', k.price_amount,
                                  'priceCurrency', k.price_currency,
                                  'originalPriceAmount', k.original_price_amount,
                                  'weightG', k.weight_g,
                                  'barcode', k.barcode,
                                  'merchantCode', k.merchant_code,
                                  'status', k.status)
                              ORDER BY k.spec_key)
                         FROM catalog.sku k
                        WHERE k.spu_id = s.id
                   ), '[]'::jsonb) AS skus,
                   l.id            AS listingId,
                   l.status        AS listingStatus,
                   l.reject_reason AS rejectReason
              FROM catalog.spu s
              LEFT JOIN LATERAL (
                  SELECT l.id, l.status, l.reject_reason
                    FROM catalog.listing l
                   WHERE l.spu_id = s.id
                   ORDER BY CASE l.status
                                WHEN 'pending'  THEN 0
                                WHEN 'rejected' THEN 1
                                WHEN 'online'   THEN 2
                                WHEN 'offline'  THEN 3
                                WHEN 'approved' THEN 4
                                ELSE 5
                            END,
                            l.created_at DESC
                   FETCH FIRST 1 ROW ONLY
              ) l ON TRUE
             WHERE s.id = #{spuId}
               AND s.merchant_id = #{merchantId}
               AND s.spu_type = 'merchant'
            """)
    Optional<DetailRow> findForMerchant(@Param("spuId") UUID spuId, @Param("merchantId") UUID merchantId);

    /**
     * 详情的一行。三组 jsonb 由同一条语句产出，快照一致；解析见 {@link #toDetail()}。
     *
     * <p>{@code rejectReason} 只在 {@code status = 'rejected'} 时有值——那列在迁移里是
     * {@code CASE WHEN target = 'rejected'} 才写的，所以不需要额外判状态。
     */
    record DetailRow(
            UUID spuId,
            String title,
            String subtitle,
            UUID categoryId,
            UUID brandId,
            String modelNo,
            boolean sevenDayReturn,
            long soldCount,
            String images,
            String detailImages,
            String attributes,
            String specImages,
            String skus,
            UUID listingId,
            String listingStatus,
            String rejectReason) {

        public SellerProductDetail toDetail() {
            List<SpecImageView> parsedSpecImages = readSpecImages(specImages);
            return new SellerProductDetail(
                    spuId,
                    title,
                    subtitle,
                    categoryId,
                    brandId,
                    modelNo,
                    sevenDayReturn,
                    soldCount,
                    JsonColumns.readStringList(images),
                    JsonColumns.readStringList(detailImages),
                    readAttributes(attributes),
                    parsedSpecImages,
                    readSkus(skus, parsedSpecImages),
                    listingId,
                    listingStatus,
                    rejectReason);
        }

        private List<SellerProductDetail.AttributeView> readAttributes(String raw) {
            List<AttrJson> parsed = JsonColumns.read(raw, new TypeReference<List<AttrJson>>() {});
            if (parsed == null) {
                return List.of();
            }
            return parsed.stream()
                    .map(item -> new SellerProductDetail.AttributeView(
                            item.attributeId(), item.code(), item.name(), item.value()))
                    .toList();
        }

        private List<SellerProductDetail.SkuView> readSkus(String raw, List<SpecImageView> specImages) {
            List<SkuJson> parsed = JsonColumns.read(raw, new TypeReference<List<SkuJson>>() {});
            if (parsed == null) {
                return List.of();
            }
            return parsed.stream()
                    .map(item -> {
                        Map<String, String> specs = readSpecs(item.specValues());
                        return new SellerProductDetail.SkuView(
                                item.skuId(),
                                skuName(title, specs),
                                specs,
                                new Money(item.priceAmount(), item.priceCurrency()),
                                item.originalPriceAmount() == null
                                        ? null
                                        : new Money(item.originalPriceAmount(), item.priceCurrency()),
                                item.weightG(),
                                item.barcode(),
                                item.merchantCode(),
                                specImageUrl(specs, specImages),
                                item.status());
                    })
                    .toList();
        }

        private List<SpecImageView> readSpecImages(String raw) {
            List<SpecImageJson> parsed = JsonColumns.read(raw, new TypeReference<List<SpecImageJson>>() {});
            if (parsed == null) {
                return List.of();
            }
            return parsed.stream()
                    .map(item -> new SpecImageView(item.attributeId(), item.value(), item.imageUrl()))
                    .toList();
        }

        private static String skuName(String title, Map<String, String> specs) {
            if (specs.isEmpty()) {
                return title;
            }
            return title + " "
                    + String.join(" ", specs.values().stream().sorted().toList());
        }

        private static String specImageUrl(Map<String, String> specs, List<SpecImageView> specImages) {
            for (String value : specs.values()) {
                for (SpecImageView image : specImages) {
                    if (image.value().equals(value)) {
                        return image.imageUrl();
                    }
                }
            }
            return null;
        }

        private Map<String, String> readSpecs(String raw) {
            if (raw == null || raw.isBlank()) {
                return Map.of();
            }
            Map<String, String> parsed = JsonColumns.read(raw, new TypeReference<Map<String, String>>() {});
            return parsed == null ? Map.of() : Map.copyOf(parsed);
        }

        private record AttrJson(UUID attributeId, String code, String name, String value) {}

        private record SpecImageJson(UUID attributeId, String value, String imageUrl) {}

        private record SkuJson(
                UUID skuId,
                String specValues,
                long priceAmount,
                String priceCurrency,
                Long originalPriceAmount,
                Integer weightG,
                String barcode,
                String merchantCode,
                String status) {}
    }
}
