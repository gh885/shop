package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.dto.SellerProductDetail;
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
                   s.category_id   AS categoryId,
                   s.brand_id      AS brandId,
                   s.model_no      AS modelNo,
                   COALESCE((
                       SELECT jsonb_agg(m.url ORDER BY m.sort, m.created_at)
                         FROM catalog.spu_media m
                        WHERE m.spu_id = s.id
                          AND m.attribute_id IS NULL
                          AND m.media_type = 'image'
                   ), '[]'::jsonb) AS images,
                   COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                                  'attributeId', sa.attribute_id,
                                  'code', a.code,
                                  'name', a.name,
                                  'value', COALESCE(sa.value_text, sa.value_num::text, sa.value_bool::text))
                              ORDER BY a.code)
                         FROM catalog.spu_attr sa
                         JOIN catalog.attribute a ON a.id = sa.attribute_id
                        WHERE sa.spu_id = s.id
                   ), '[]'::jsonb) AS attributes,
                   COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                                  'skuId', k.id,
                                  'specValues', CAST(k.spec_values AS text),
                                  'priceAmount', k.price_amount,
                                  'priceCurrency', k.price_currency,
                                  'weightG', k.weight_g,
                                  'barcode', k.barcode,
                                  'status', k.status)
                              ORDER BY k.spec_key)
                         FROM catalog.sku k
                        WHERE k.spu_id = s.id
                   ), '[]'::jsonb) AS skus,
                   l.id            AS listingId,
                   l.status        AS listingStatus,
                   l.reject_reason AS rejectReason
              FROM catalog.spu s
              LEFT JOIN catalog.listing l ON l.spu_id = s.id
             WHERE s.id = #{spuId}
               AND s.merchant_id = #{merchantId}
               AND s.spu_type = 'merchant'
             ORDER BY l.created_at DESC
             FETCH FIRST 1 ROW ONLY
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
            UUID categoryId,
            UUID brandId,
            String modelNo,
            String images,
            String attributes,
            String skus,
            UUID listingId,
            String listingStatus,
            String rejectReason) {

        public SellerProductDetail toDetail() {
            return new SellerProductDetail(
                    spuId,
                    title,
                    categoryId,
                    brandId,
                    modelNo,
                    JsonColumns.readStringList(images),
                    readAttributes(attributes),
                    readSkus(skus),
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

        private List<SellerProductDetail.SkuView> readSkus(String raw) {
            List<SkuJson> parsed = JsonColumns.read(raw, new TypeReference<List<SkuJson>>() {});
            if (parsed == null) {
                return List.of();
            }
            return parsed.stream()
                    .map(item -> new SellerProductDetail.SkuView(
                            item.skuId(),
                            readSpecs(item.specValues()),
                            new Money(item.priceAmount(), item.priceCurrency()),
                            item.weightG(),
                            item.barcode(),
                            item.status()))
                    .toList();
        }

        private Map<String, String> readSpecs(String raw) {
            if (raw == null || raw.isBlank()) {
                return Map.of();
            }
            Map<String, String> parsed = JsonColumns.read(raw, new TypeReference<Map<String, String>>() {});
            return parsed == null ? Map.of() : Map.copyOf(parsed);
        }

        private record AttrJson(UUID attributeId, String code, String name, String value) {}

        private record SkuJson(
                UUID skuId,
                String specValues,
                long priceAmount,
                String priceCurrency,
                Integer weightG,
                String barcode,
                String status) {}
    }
}
