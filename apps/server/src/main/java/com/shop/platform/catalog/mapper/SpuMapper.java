package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.dto.ProductDetail;
import com.shop.platform.catalog.dto.SpecImageView;
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
                 identity_kind, match_key, title, subtitle, seven_day_return)
            VALUES (#{id}, 'merchant', #{merchantId}, #{categoryId}, #{brandId}, #{modelNo},
                    #{identityKind}, #{matchKey}, #{title}, #{subtitle}, #{sevenDayReturn})
            """)
    void insertSpu(
            @Param("id") UUID spuId,
            @Param("merchantId") UUID merchantId,
            @Param("categoryId") UUID categoryId,
            @Param("brandId") UUID brandId,
            @Param("title") String title,
            @Param("subtitle") String subtitle,
            @Param("sevenDayReturn") boolean sevenDayReturn,
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
     *
     * <p><b>冲突键带 {@code category_id}。</b> {@code param_hash} 的键只由属性 code + 值拼成，
     * 不同类目撞键是常事；不带类目会让两个不相干的商品共用一个标准品。
     */
    @Select(
            """
            INSERT INTO catalog.spu
                (id, spu_type, merchant_id, category_id, brand_id, model_no,
                 identity_kind, match_key, title)
            VALUES (#{id}, 'standard', NULL, #{categoryId}, #{brandId}, #{modelNo},
                    #{identityKind}, #{matchKey}, #{title})
            ON CONFLICT (category_id, identity_kind, match_key) WHERE spu_type = 'standard'
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
             WHERE spu_type = 'standard'
               AND category_id = #{categoryId}
               AND identity_kind = #{identityKind}
               AND match_key = #{matchKey}
            """)
    UUID findStandardId(
            @Param("categoryId") UUID categoryId,
            @Param("identityKind") IdentityKind identityKind,
            @Param("matchKey") String matchKey);

    /**
     * 找到标准品，没有就建一个。返回标准品 id。
     *
     * <p><b>标准品是懒建的，没有独立的创建入口。</b> 第一个发布到这个识别键的商家顺手把它建出来，
     * 后来的人直接挂上。理由：平台预建 10 万条标准品的成本远高于让第一条商品带出来，
     * 而"没有标准品"本身不阻塞任何事——挂不上只是归并少一组。
     *
     * <p>识别键按类目分区：同一个 {@code match_key} 在不同类目下是两个标准品。
     * 白牌的参数哈希不含类目，跨类目共用一个标准品会把比价列表搅乱。
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
        return findStandardId(categoryId, identityKind, matchKey);
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

    /**
     * 清掉挂载。
     *
     * <p><b>为什么需要单独一个方法。</b> {@link com.shop.platform.catalog.service.StandardMatcher#match}
     * 在认不出识别键时直接 return（不写任何列），这是对的——但改商品时「认不出新键」恰恰意味着
     * **旧挂载必须被清掉**：商品已经叫另一个名字了，却还挂在上一个识别键的标准品上。
     * 不存这一步，它会出现在一个与它无关的比价列表里，而两边都看不出错在哪。
     *
     * <p>{@code standard_matched_by} 一起置空：{@code ck_spu_matched} 没要求两者同生同死，
     * 但留着一个「按型号匹配」的标记而指向 NULL，是一条自己说不通的脏数据。
     */
    @Update(
            """
            UPDATE catalog.spu
               SET standard_spu_id = NULL, standard_matched_by = NULL
             WHERE id = #{spuId}
            """)
    void clearStandard(@Param("spuId") UUID spuId);

    /** 发布前点查：只认商家 SPU（standard 行没有归属商家，不能挂售）。 */
    @Select(
            """
            SELECT merchant_id AS merchantId, category_id AS categoryId, brand_id AS brandId,
                   title AS title, subtitle AS subtitle
              FROM catalog.spu
             WHERE id = #{spuId} AND spu_type = 'merchant'
            """)
    Optional<PublishRow> findForPublish(@Param("spuId") UUID spuId);

    /**
     * 编辑前点查：归属、当前标题、以及这家店有没有已经挂售的 listing。
     *
     * <p><b>为什么把 listing 状态一起读出来。</b> “改完要不要重审”不取决于改了什么，
     * 而取决于<b>这个商品现在是不是在卖</b>：草稿态怎么改都没人看得到；
     * 已上架的改了就必须重新过闸，否则“先上架合规商品、再改成违规商品”就是一条绕过审核的路。
     *
     * <p>所以这条查询同时给三样：能不能改（归属）、改的是什么（标题）、改完要不要重审（listing 状态）。
     * 拆成两次查询就会在两次之间被并发改掉。
     */
    @Select(
            """
            SELECT s.merchant_id AS merchantId,
                   s.category_id AS categoryId,
                   s.brand_id    AS brandId,
                   s.title       AS title,
                   s.subtitle    AS subtitle,
                   l.id          AS listingId,
                   l.status      AS listingStatus
              FROM catalog.spu s
              LEFT JOIN LATERAL (
                  SELECT l.id, l.status
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
             WHERE s.id = #{spuId} AND s.spu_type = 'merchant'
            """)
    Optional<EditableSpu> findEditable(@Param("spuId") UUID spuId);

    /**
     * 改基本信息。
     *
     * <p><b>只改标题、品牌、型号。</b> 类目不能改：改了类目等于换了一套属性模板与值域，
     * 旧属性行全部对不上（{@code ck_spu_attr_one_value} 是按旧模板的类型落的库），
     * 唯一干净的修法是删了重建。这条口子在 {@link #findEditable} 里根本读不到目标类目，
     * 所以它不可能被“顺手”开放。
     *
     * <p><b>识别键重算。</b> 标题改了不影响识别键，但<b>品牌和型号改了必须重算</b>——
     * 识别键是 {@code 品牌:型号} 拼出来的，不重算就会出现“商品叫 A、标准品挂在 B 上”，
     * 比价从此全错，而且没人会想到去查这一列。
     *
     * <p>{@code updated_at} 由触发器 {@code trg_spu_touch} 维护，这里不写。
     */
    @Update(
            """
            UPDATE catalog.spu
               SET title = #{title},
                   subtitle = #{subtitle},
                   seven_day_return = COALESCE(#{sevenDayReturn}, seven_day_return),
                   brand_id = #{brandId},
                   model_no = #{modelNo},
                   identity_kind = #{identityKind},
                   match_key = #{matchKey}
             WHERE id = #{spuId} AND merchant_id = #{merchantId}
            """)
    int updateBasics(
            @Param("spuId") UUID spuId,
            @Param("merchantId") UUID merchantId,
            @Param("title") String title,
            @Param("subtitle") String subtitle,
            @Param("sevenDayReturn") Boolean sevenDayReturn,
            @Param("brandId") UUID brandId,
            @Param("modelNo") String modelNo,
            @Param("identityKind") IdentityKind identityKind,
            @Param("matchKey") String matchKey);

    /**
     * 删草稿。只删得掉“从来没挂售过”的 SPU——有一条 listing 就不行。
     *
     * <p>条件是 {@code NOT EXISTS} 而不是“先查有没有 listing 再删”：
     * 两次查询之间商家可能刚好提交了挂售，那一删就把正在审核的商品删了。
     * 0 行就是判决——调用方据此回 409。
     */
    @Update(
            """
            DELETE FROM catalog.spu
             WHERE id = #{spuId} AND merchant_id = #{merchantId}
               AND NOT EXISTS (SELECT 1 FROM catalog.listing l WHERE l.spu_id = catalog.spu.id)
            """)
    int deleteDraft(@Param("spuId") UUID spuId, @Param("merchantId") UUID merchantId);

    /** 这个类目下有多少商家商品。类目配置里识别键/匹配策略的「锁死」判据。 */
    @Select("SELECT count(*) FROM catalog.spu WHERE category_id = #{categoryId} AND spu_type = 'merchant'")
    long countMerchantSpusByCategory(@Param("categoryId") UUID categoryId);

    /** 订单完成累加销量。0 行 = 商品不存在（订单持有快照，不该让完成失败）。 */
    @Update(
            "UPDATE catalog.spu SET sold_count = sold_count + #{quantity} WHERE id = #{spuId} AND spu_type = 'merchant'")
    int addSold(@Param("spuId") UUID spuId, @Param("quantity") int quantity);

    /** 可编辑点查的一行。{@code listingId} / {@code listingStatus} 为 null = 还没提交过挂售。 */
    record EditableSpu(
            UUID merchantId,
            UUID categoryId,
            UUID brandId,
            String title,
            String subtitle,
            UUID listingId,
            String listingStatus) {}

    /**
     * 买家看到的商品详情的数据。库存不在这一条里——它是别人的表，只能经
     * {@code inventory :: api} 问，组装由 {@code CatalogPublishService#product} 做。
     *
     * <p><b>三张表在同一个事务里读，不分开查。</b> 分开查的窗口里商家可能改价或下架，
     * 拼出来的详情就是"标题是新的、价格是旧的"这种不存在的组合。
     * 调用方在事务外调它，所以这里显式用 {@code READ COMMITTED} 的单语句读三张表——
     * PostgreSQL 的单条语句拿的是同一个快照。
     *
     * <p>具体做法是一次查询 + 两次数组成员：属性用 {@code jsonb_agg} 聚成数组，
     * SKU 也聚成数组。三个数组由同一条语句产出，快照必然一致。
     */
    @Select(
            """
            SELECT s.id,
                   s.title,
                   s.subtitle,
                   s.category_id    AS categoryId,
                   s.brand_id       AS brandId,
                   s.seven_day_return AS sevenDayReturn,
                   s.sold_count     AS soldCount,
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
                                  'code', a.code,
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
                                  'id', k.id,
                                  'specValues', CAST(k.spec_values AS text),
                                  'priceAmount', k.price_amount,
                                  'priceCurrency', k.price_currency,
                                  'originalPriceAmount', k.original_price_amount)
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
               AND EXISTS (
                   SELECT 1 FROM catalog.category c
                    WHERE c.id = s.category_id AND c.status IN ('active', 'frozen')
               )
            """)
    Optional<DetailRow> findDetailRow(@Param("spuId") UUID spuId);

    /**
     * 收藏列表要的轻量投影：一个 SPU 现在能不能买、叫什么、多少钱、哪张图。
     *
     * <p><b>为什么不在 favorite 里拼。</b> “这个商品现在还能不能买”的判据只有 catalog 有：
     * SKU 是否 active、是否有 online listing。收藏表只存 spu_id，自己去 JOIN 三张 catalog 表
     * 就是跨 schema 读别人的数据——{@code DataScopeTest} 之外，module-map 第 9 条铁律也禁止。
     *
     * <p><b>为什么是 SPU 级而不是 SKU 级。</b> 收藏的是商品不是规格（买家点的是心形图标，
     * 他没选颜色）。所以这里返回的是“这个 SPU 的最低价”，与详情页的 {@code minPrice} 同一口径。
     *
     * <p>查不到的 SPU 不在返回 Map 里（与 {@link SkuMapper#findSellableByIds} 同一约定），
     * 调用方据此置灰而不是报错——下架是常态，不该让收藏列表 500。
     */
    @Select(
            """
            <script>
            SELECT DISTINCT ON (s.id)
                   s.id            AS spuId,
                   s.title         AS title,
                   (SELECT m.url
                      FROM catalog.spu_media m
                     WHERE m.spu_id = s.id
                       AND m.attribute_id IS NULL
                       AND m.media_type = 'image'
                     ORDER BY m.sort, m.created_at
                     FETCH FIRST 1 ROW ONLY) AS imageUrl,
                   (SELECT min(k.price_amount)
                      FROM catalog.sku k
                     WHERE k.spu_id = s.id AND k.status = 'active') AS minPriceAmount,
                   (SELECT k.price_currency
                      FROM catalog.sku k
                     WHERE k.spu_id = s.id AND k.status = 'active'
                     ORDER BY k.price_amount
                     FETCH FIRST 1 ROW ONLY) AS minPriceCurrency
              FROM catalog.spu s
             WHERE s.id IN <foreach collection="spuIds" item="sid" open="(" separator="," close=")">#{sid}</foreach>
               AND s.spu_type = 'merchant'
               AND EXISTS (
                   SELECT 1 FROM catalog.listing o
                    WHERE o.spu_id = s.id AND o.status = 'online'
               )
               AND EXISTS (
                   SELECT 1 FROM catalog.category c
                    WHERE c.id = s.category_id AND c.status IN ('active', 'frozen')
               )
            </script>
            """)
    List<SellableSpuRow> findSellableSpusByIds(@Param("spuIds") java.util.Collection<UUID> spuIds);

    /**
     * 可售 SPU 的一行。价格拆两列拿原始形状，{@link Money} 由调用方组装——
     * 与 {@link SkuMapper.SellableRow} 同一条规矩：边界上只有一个金额形状。
     *
     * <p>{@code minPriceAmount} 可空：SPU 还在卖（有 online listing）但所有 SKU 都 disabled。
     * 那不是“不可售”，是“暂无报价”，两种情况前端展示不同。
     */
    record SellableSpuRow(UUID spuId, String title, String imageUrl, Long minPriceAmount, String minPriceCurrency) {}

    /** 不暴露给调用方；只用于 spec_key 的稳定拼接。单规格商品返回空串。 */
    static String specKey(Map<UUID, String> specs) {
        if (specs == null || specs.isEmpty()) {
            return "";
        }
        return specs.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .reduce((left, right) -> left + "|" + right)
                .orElse("");
    }

    /** 发布前点查的一行（merchant/category/brand + 公开文本）。 */
    record PublishRow(UUID merchantId, UUID categoryId, UUID brandId, String title, String subtitle) {}

    /**
     * 买家详情的一行。images/attributes/skus 等 jsonb 数组由同一条语句产出，快照必然一致。
     *
     * <p>库存不在这条语句里（别人的表），所以 {@link #toDetail(Map)} 要调用方把量传进来。
     * 这是一个参数而不是一次内部查询：mapper 不该跨模块取数，那是 {@code CatalogPublishService} 的事。
     */
    record DetailRow(
            UUID id,
            String title,
            String subtitle,
            UUID categoryId,
            UUID brandId,
            boolean sevenDayReturn,
            long soldCount,
            String images,
            String detailImages,
            String attributes,
            String specImages,
            String skus) {

        /** 这条详情里的 SKU，供调用方批查库存。 */
        public List<UUID> skuIds() {
            List<SkuJson> parsed = JsonColumns.read(skus, new TypeReference<List<SkuJson>>() {});
            return parsed == null ? List.of() : parsed.stream().map(SkuJson::id).toList();
        }

        /**
         * @param availableToPromise 各 SKU 的可售量（默认仓口径）。查不到按 0——
         *     "没建过库存行"和"卖光了"对买家是同一件事
         */
        public ProductDetail toDetail(Map<UUID, Integer> availableToPromise) {
            List<ProductDetail.AttributeView> parsedAttributes = readAttributes(attributes);
            List<SpecImageView> parsedSpecImages = readSpecImages(specImages);
            List<ProductDetail.SkuView> parsedSkus = readSkus(skus, availableToPromise, parsedSpecImages);
            Money minPrice = minPrice(parsedSkus);
            return new ProductDetail(
                    id,
                    title,
                    subtitle,
                    categoryId,
                    brandId,
                    sevenDayReturn,
                    soldCount,
                    JsonColumns.readStringList(images),
                    JsonColumns.readStringList(detailImages),
                    parsedAttributes,
                    parsedSpecImages,
                    parsedSkus,
                    minPrice);
        }

        /**
         * 起价按「可售且有库存」重算；全部缺货时回退全部 active SKU 的最低价。
         * 缺货的最低价 SKU 不能当「¥x 起」的引流价，否则点进去价格立刻变。
         */
        private static Money minPrice(List<ProductDetail.SkuView> skus) {
            Money inStock = skus.stream()
                    .filter(sku -> sku.availableToPromise() > 0)
                    .map(ProductDetail.SkuView::price)
                    .min(Comparator.comparingLong(Money::amount))
                    .orElse(null);
            if (inStock != null) {
                return inStock;
            }
            return skus.stream()
                    .map(ProductDetail.SkuView::price)
                    .min(Comparator.comparingLong(Money::amount))
                    .orElse(Money.cny(0));
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

        private List<SpecImageView> readSpecImages(String raw) {
            List<SpecImageJson> parsed = JsonColumns.read(raw, new TypeReference<List<SpecImageJson>>() {});
            if (parsed == null) {
                return List.of();
            }
            return parsed.stream()
                    .map(item -> new SpecImageView(item.attributeId(), item.value(), item.imageUrl()))
                    .toList();
        }

        private List<ProductDetail.SkuView> readSkus(
                String raw, Map<UUID, Integer> availableToPromise, List<SpecImageView> specImages) {
            List<SkuJson> parsed = JsonColumns.read(raw, new TypeReference<List<SkuJson>>() {});
            if (parsed == null) {
                return List.of();
            }
            return parsed.stream()
                    .map(item -> {
                        Map<String, String> specs = readSpecs(item.specValues());
                        return new ProductDetail.SkuView(
                                item.id(),
                                skuName(title, specs),
                                specs,
                                new Money(item.priceAmount(), item.priceCurrency()),
                                item.originalPriceAmount() == null
                                        ? null
                                        : new Money(item.originalPriceAmount(), item.priceCurrency()),
                                specImageUrl(specs, specImages),
                                availableToPromise.getOrDefault(item.id(), 0));
                    })
                    .toList();
        }

        private static String skuName(String title, Map<String, String> specs) {
            if (specs.isEmpty()) {
                return title;
            }
            String suffix = String.join(" ", specs.values().stream().sorted().toList());
            return title + " " + suffix;
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

        private record AttrJson(String code, String value) {}

        private record SpecImageJson(UUID attributeId, String value, String imageUrl) {}

        private record SkuJson(
                UUID id, String specValues, long priceAmount, String priceCurrency, Long originalPriceAmount) {}
    }
}
