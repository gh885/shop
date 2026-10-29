package com.shop.platform.catalog.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.catalog.dto.CreateProductRequest;
import com.shop.platform.catalog.dto.ListingResult;
import com.shop.platform.catalog.dto.ProductDetail;
import com.shop.platform.catalog.dto.SpecImageRequest;
import com.shop.platform.catalog.dto.UpdateProductRequest;
import com.shop.platform.catalog.events.ListingOffline;
import com.shop.platform.catalog.events.ListingPublished;
import com.shop.platform.catalog.mapper.BrandMapper;
import com.shop.platform.catalog.mapper.CategoryConfigMapper;
import com.shop.platform.catalog.mapper.CategoryMapper;
import com.shop.platform.catalog.mapper.CategoryRow;
import com.shop.platform.catalog.mapper.ListingMapper;
import com.shop.platform.catalog.mapper.SkuMapper;
import com.shop.platform.catalog.mapper.SpuAttrMapper;
import com.shop.platform.catalog.mapper.SpuMapper;
import com.shop.platform.catalog.mapper.SpuMediaMapper;
import com.shop.platform.catalog.model.BrandPolicy;
import com.shop.platform.catalog.model.CategoryConfig;
import com.shop.platform.catalog.model.IdentityKind;
import com.shop.platform.catalog.model.Listing;
import com.shop.platform.catalog.model.ListingStatus;
import com.shop.platform.catalog.model.ValueType;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import com.shop.platform.governance.api.ForbiddenWordQuery;
import com.shop.platform.governance.api.GovernanceQuery;
import com.shop.platform.governance.api.SellDecision;
import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.inventory.api.InventoryQuery;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;

/**
 * 商品发布的核心流程：建 SPU/SKU → 提交 listing → 免审类目自动上架 / 人工审核后上架。
 *
 * <p>发布闸门集中在这里，编辑链路复用同一组方法；两处各写一份迟早会漂。
 */
@Component
public class CatalogPublishService {

    private final CategoryMapper categories;
    private final CategoryConfigMapper configs;
    private final BrandMapper brands;
    private final IdentityKeyResolver identityKeys;
    private final StandardMatcher standard;
    private final SpuMapper products;
    private final SkuMapper skus;
    private final SpuAttrMapper attributes;
    private final SpuMediaMapper medias;
    private final ListingMapper listings;
    private final GovernanceQuery governance;
    private final ForbiddenWordQuery forbiddenWords;
    private final AuditCommand audit;
    private final InventoryQuery inventory;
    private final ApplicationEventPublisher events;

    public CatalogPublishService(
            CategoryMapper categories,
            CategoryConfigMapper configs,
            BrandMapper brands,
            IdentityKeyResolver identityKeys,
            StandardMatcher standard,
            SpuMapper products,
            SkuMapper skus,
            SpuAttrMapper attributes,
            SpuMediaMapper medias,
            ListingMapper listings,
            GovernanceQuery governance,
            ForbiddenWordQuery forbiddenWords,
            AuditCommand audit,
            InventoryQuery inventory,
            ApplicationEventPublisher events) {
        this.categories = Objects.requireNonNull(categories, "categories");
        this.configs = Objects.requireNonNull(configs, "configs");
        this.brands = Objects.requireNonNull(brands, "brands");
        this.identityKeys = Objects.requireNonNull(identityKeys, "identityKeys");
        this.standard = Objects.requireNonNull(standard, "standard");
        this.products = Objects.requireNonNull(products, "products");
        this.skus = Objects.requireNonNull(skus, "skus");
        this.attributes = Objects.requireNonNull(attributes, "attributes");
        this.medias = Objects.requireNonNull(medias, "medias");
        this.listings = Objects.requireNonNull(listings, "listings");
        this.governance = Objects.requireNonNull(governance, "governance");
        this.forbiddenWords = Objects.requireNonNull(forbiddenWords, "forbiddenWords");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.inventory = Objects.requireNonNull(inventory, "inventory");
        this.events = Objects.requireNonNull(events, "events");
    }

    @Transactional
    public UUID createDraft(CreateProductRequest request, CurrentOperator operator) {
        UUID merchantId = requireSeller(operator);
        CategoryRow category = requireMountableCategory(request.categoryId());
        CategoryConfig config = requireConfig(category.id());
        checkBrandPolicy(BrandPolicy.from(config.brandPolicy()), request.brandId());
        checkGovernance(merchantId, category.id(), request.brandId(), config);
        // 属性值表算一次，闸门、识别键和落库都用它——算两次就会有两份可能不同的值
        Map<UUID, List<String>> attributeValues = createAttributeValues(request.attributes());
        checkRequiredAttributes(config, attributeValues);
        List<SkuSpecInput> skuInputs = request.skus().stream()
                .map(sku -> new SkuSpecInput(sku.specs(), sku.barcode()))
                .toList();
        checkSpecAttributes(config, skuInputs);
        checkBarcodes(config, skuInputs);

        Set<String> specKeys = new HashSet<>();
        for (SkuSpecInput sku : skuInputs) {
            String key = SpuMapper.specKey(sku.specs());
            if (!specKeys.add(key)) {
                throw BusinessException.conflict(ErrorCodes.DUPLICATE_SKU_SPEC, "同一 SPU 下规格组合重复: " + key);
            }
        }

        // 识别键由 resolver 统一算，不在这里拼——"怎么认商品"只能有一处判断
        IdentityKeyResolver.ResolvedIdentity identity =
                identityKeys.resolveSpu(config, request.modelNo(), brandName(request.brandId()), attributeValues);

        UUID spuId = Ids.newId();
        products.insertSpu(
                spuId,
                merchantId,
                category.id(),
                request.brandId(),
                request.title(),
                request.subtitle(),
                request.sevenDayReturnOrDefault(),
                request.modelNo(),
                identity.kind(),
                identity.matchKey());
        medias.insertGenericImages(spuId, request.images());
        medias.insertDetailImages(spuId, request.detailImages());
        insertSpecImages(spuId, config, request.specImages());

        Set<String> merchantCodes = new HashSet<>();
        for (CreateProductRequest.SkuRequest sku : request.skus()) {
            validateMerchantCode(merchantId, sku.merchantCode(), null, merchantCodes);
            validateSkuPrice(sku.price(), sku.originalPrice());
            skus.insertSku(
                    Ids.newId(),
                    spuId,
                    merchantId,
                    sku.specs(),
                    sku.price(),
                    sku.originalPrice(),
                    sku.weightG(),
                    sku.barcode(),
                    sku.merchantCode(),
                    identityKeys.resolveSku(config, sku.barcode(), sku.specs()));
        }
        // 标准品在 SPU 落库之后挂：它引用 spu_id，而且标准品的标题取这条商品的。
        // 认不出来的（identityKind = none）直接跳过——白牌非标本来就挂不上。
        standard.match(
                spuId,
                category.id(),
                request.brandId(),
                request.modelNo(),
                request.title(),
                identity.kind(),
                identity.matchKey());
        insertAttributes(spuId, config, attributeValues);
        return spuId;
    }

    /**
     * 提交挂售。
     *
     * <p><b>驳回后重提走的是同一条 listing，不是新建一条。</b> 这是文档定的：
     * 「驳回后重提是改原 listing，不是新建一条。否则反复驳回会让同一个商品长出一堆记录，
     * 唯一约束也保不住」。
     *
     * <p>原来这里只会新建 listing，撞 {@code uq_offer_spu_shop} 直接 409，于是
     * {@code REJECTED → PENDING} 那条状态机永远走不到、{@code round} 永远是 1、
     * {@code uq_listing_review_round} 永远不触发——状态机和表约束都写了，代码没接。
     *
     * <p>三条分支：
     *
     * <ul>
     *   <li>没 listing → 新建，pending
     *   <li>已 rejected / offline → 回 pending，round+1（重提）
     *   <li>已 pending / approved / online → 409，不该重复提交
     * </ul>
     */
    @Transactional
    public ListingResult submitListing(UUID spuId, UUID shopId, CurrentOperator operator) {
        return submitListing(spuId, shopId, operator, true);
    }

    /**
     * 编辑触发的重提：商品内容变更是 SPU 级的，会影响该商家所有店铺的 listing。
     * 这时不再逐个 shop 判操作员的店铺授权——重提的是同一商家自己的商品，
     * 归属校验仍在（requireSeller + SPU owner）。
     */
    ListingResult submitListingInternal(UUID spuId, UUID shopId, CurrentOperator operator) {
        return submitListing(spuId, shopId, operator, false);
    }

    private ListingResult submitListing(UUID spuId, UUID shopId, CurrentOperator operator, boolean checkShop) {
        UUID merchantId = requireSeller(operator);
        if (checkShop && !operator.canOperateShop(shopId)) {
            throw BusinessException.forbidden("SHOP_NOT_OPERABLE", "无权操作店铺: " + shopId);
        }

        SpuMapper.PublishRow spu =
                products.findForPublish(spuId).orElseThrow(() -> BusinessException.notFound("商品不存在: " + spuId));
        if (!spu.merchantId().equals(merchantId)) {
            throw BusinessException.forbidden("SPU_NOT_OWNED", "商品不属于当前商家");
        }
        checkForbiddenWords(spu.title(), spu.subtitle());

        // 新挂入要类目可挂；已有 listing 的重提只要类目没停卖——frozen 类目允许存量继续卖。
        Optional<Listing> existing = listings.findBySpuAndShop(spuId, shopId);
        CategoryRow category =
                existing.isPresent() ? requireCategory(spu.categoryId()) : requireMountableCategory(spu.categoryId());
        CategoryConfig config = requireConfig(category.id());

        // 提交前重跑全部发布闸门。草稿可能是类目配置变更之前建的，只在创建时校验等于放行旧数据。
        checkBrandPolicy(BrandPolicy.from(config.brandPolicy()), spu.brandId());
        checkStoredAttributes(config, storedAttributeValues(spuId));
        List<SkuSpecInput> storedSkus = storedSkuInputs(spuId);
        checkStoredSpecs(config, storedSkus);
        checkBarcodes(config, storedSkus);
        checkGovernance(merchantId, category.id(), spu.brandId(), config);

        Listing listing = existing.map(this::resubmit).orElseGet(() -> createPending(spuId, merchantId, shopId));

        if (!config.autoApprove()) {
            return new ListingResult(listing.id(), listing.status());
        }

        Listing approved = listing.transitionTo(ListingStatus.APPROVED);
        if (!listings.transition(listing, ListingStatus.APPROVED, null, null)) {
            throw BusinessException.conflict("LISTING_STATE_CONFLICT", "listing 刚被别的请求改过");
        }
        Listing online = approved.transitionTo(ListingStatus.ONLINE);
        if (!listings.transition(approved, ListingStatus.ONLINE, null, null)) {
            throw BusinessException.conflict("LISTING_STATE_CONFLICT", "listing 刚被别的请求改过");
        }
        listings.review(listing.id(), listings.nextRound(listing.id()), "approved", "auto_approve", null);
        audit.record(AuditEntry.bySystem(
                "catalog.listing.approved",
                "listing",
                listing.id().toString(),
                Map.of("status", FieldChange.of("pending", "online"))));
        publish(online);
        return new ListingResult(online.id(), online.status());
    }

    private Listing createPending(UUID spuId, UUID merchantId, UUID shopId) {
        Listing pending = Listing.draft(spuId, merchantId, shopId).transitionTo(ListingStatus.PENDING);
        listings.insert(pending.id(), pending.spuId(), pending.merchantId(), pending.shopId());
        return pending;
    }

    /**
     * 驳回 / 下架后重提：同一条 listing 回 pending。
     *
     * <p>{@code PENDING} 或更后的状态一律拒——重复提交会让审核队列里出现同一商品两次。
     */
    private Listing resubmit(Listing existing) {
        if (existing.status() == ListingStatus.PENDING
                || existing.status() == ListingStatus.APPROVED
                || existing.status() == ListingStatus.ONLINE) {
            throw BusinessException.conflict("LISTING_ALREADY_EXISTS", "这个商品已经在该店铺挂售，当前状态: " + existing.status());
        }
        Listing pending = existing.transitionTo(ListingStatus.PENDING);
        if (!listings.transition(existing, ListingStatus.PENDING, null, null)) {
            throw BusinessException.conflict("LISTING_STATE_CONFLICT", "listing 刚被别的请求改过");
        }
        return pending;
    }

    /**
     * 人工审核通过。<b>通过即上架</b>，不留在 approved 中间态。
     *
     * <p>原来这里是 approve → publish 两步，中间那个 {@code APPROVED} 状态没人推进：
     * 商家看到"审核通过"但商品搜不到，而后台也没有"待上架"这个队列。
     * 一个没人负责推进的中间态，等于把商品卡死在那里——比没有这个状态更糟。
     *
     * <p>文档不变式 4 仍然成立：{@code online} 只能从 {@code approved} 来，
     * 只是这两步在同一个事务里连续做，中间不落可观测的等待态。
     * 真要"先过审、运营择日上架"，那是另一个需求，得有排队和定时器，不是加一个枚举值。
     */
    @Transactional
    public void approveOffer(UUID listingId, UUID reviewerId) {
        Listing pending = requireOffer(listingId);
        Listing approved = pending.transitionTo(ListingStatus.APPROVED);
        if (!listings.transition(pending, ListingStatus.APPROVED, reviewerId, null)) {
            throw BusinessException.conflict("LISTING_STATE_CONFLICT", "listing 刚被别的请求改过");
        }
        listings.review(listingId, listings.nextRound(listingId), "approved", "manual", reviewerId);

        Listing online = approved.transitionTo(ListingStatus.ONLINE);
        if (!listings.transition(approved, ListingStatus.ONLINE, reviewerId, null)) {
            throw BusinessException.conflict("LISTING_STATE_CONFLICT", "listing 刚被别的请求改过");
        }
        audit.record(AuditEntry.byStaff(
                "catalog.listing.approved",
                "listing",
                listingId.toString(),
                reviewerId,
                online.merchantId(),
                Map.of("status", FieldChange.of("pending", "online"))));
        publish(online);
    }

    /**
     * 下架。<b>只有 online 能下</b>——pending 的商品还没上过架，
     * 谈不上下架；那种情况要拦提交，走 {@link #rejectListing}。
     *
     * <p>{@code OFFLINE → PENDING} 那条迁移是给商家重提用的，平台侧不直接走它：
     * 平台下架后要不要让商家原样重提，是治理决策，不是一个 HTTP 接口能替商家决定的。
     */
    @Transactional
    public void offlineOffer(UUID listingId, UUID operatorId, String reason) {
        offlineOffer(listingId, operatorId, reason, false);
    }

    /**
     * 下架。{@code merchantInitiated} 决定审计里的操作人类型——商家自己下架记成 staff
     * 会让「谁在什么时候下架了什么」这条追查在审计里断掉。
     */
    @Transactional
    public void offlineOffer(UUID listingId, UUID operatorId, String reason, boolean merchantInitiated) {
        Listing online = requireOffer(listingId);
        Listing offline = online.transitionTo(ListingStatus.OFFLINE);
        if (!listings.transition(online, ListingStatus.OFFLINE, operatorId, reason)) {
            throw BusinessException.conflict("LISTING_STATE_CONFLICT", "listing 刚被别的请求改过");
        }
        Map<String, FieldChange> changes =
                Map.of("status", FieldChange.of("online", "offline"), "reason", FieldChange.to(reason));
        if (merchantInitiated) {
            audit.record(AuditEntry.byMerchant(
                    "catalog.listing.offline", "listing", listingId.toString(), offline.merchantId(), changes));
        } else {
            audit.record(AuditEntry.byStaff(
                    "catalog.listing.offline",
                    "listing",
                    listingId.toString(),
                    operatorId,
                    offline.merchantId(),
                    changes));
        }
        // 事件必须发：只发上架不发下架，搜索索引里会永远留着这条商品，        // 买家点进去 404 而后台显示"已下架"（product-model.md §5 失败模式第一条）
        events.publishEvent(new ListingOffline(
                Ids.newId(), listingId, offline.merchantId(), offline.spuId(), offline.shopId(), Instant.now()));
    }

    /** 审核通过后上架。 */
    /**
     * 人工驳回。<b>理由必填。</b>
     *
     * <p>空理由的驳回，商家只知道"没过"，不知道该改什么——他会原样重提，
     * 然后你再驳回一次，round +1，两边都白费。这条理由同时进 {@code listing_review.reason}
     * 和审计，是商家唯一能看见的反馈渠道。
     */
    @Transactional
    public void rejectListing(UUID listingId, UUID reviewerId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw BusinessException.badRequest("REJECT_REASON_REQUIRED", "驳回必须填理由，否则商家不知道该改什么");
        }
        Listing pending = requireOffer(listingId);
        Listing rejected = pending.transitionTo(ListingStatus.REJECTED);
        if (!listings.transition(pending, ListingStatus.REJECTED, reviewerId, reason)) {
            throw BusinessException.conflict("LISTING_STATE_CONFLICT", "listing 刚被别的请求改过");
        }
        listings.review(listingId, listings.nextRound(listingId), "rejected", reason, reviewerId);
        audit.record(AuditEntry.byStaff(
                "catalog.listing.rejected",
                "listing",
                listingId.toString(),
                reviewerId,
                rejected.merchantId(),
                Map.of("status", FieldChange.of("pending", "rejected"), "reason", FieldChange.to(reason))));
    }

    /** 审核队列。FIFO，给平台运营看；{@code merchantId} 传 null 看全平台，传了只看这家店。 */
    public List<ListingMapper.PendingOffer> pendingOffers(UUID merchantId, int limit) {
        return listings.findPending(merchantId, limit);
    }

    /**
     * 买家详情。<b>库存是第二个往返，经 {@code inventory :: api} 问。</b>
     *
     * <p>为什么不塞进那条详情 SQL：{@code inventory.stock} 是别人的表，跨 schema JOIN 是铁律禁止的。
     * 两个往返换来的是「这个 SKU 现在能卖几件」只有一处定义。
     *
     * <p>两次读之间夹着一个窗口，所以展示的库存可能比下单时多一件或少一件。可以接受：
     * 真正的判决在预占那条条件更新上，详情页的「有货」只是提示。
     */
    public ProductDetail product(UUID spuId) {
        SpuMapper.DetailRow row =
                products.findDetailRow(spuId).orElseThrow(() -> BusinessException.notFound("商品不存在或未上架: " + spuId));
        return row.toDetail(inventory.availableToPromiseByIds(row.skuIds()));
    }

    private void publish(Listing listing) {
        // 事件里只带类目与最低价，不带库存：库存是会变的，把它写进「上架事实」等于发一条注定过期的数据
        ProductDetail detail = products.findDetailRow(listing.spuId())
                .map(row -> row.toDetail(Map.of()))
                .orElseThrow(() -> new IllegalStateException("刚上架的商品读不到: " + listing.spuId()));
        events.publishEvent(new ListingPublished(
                Ids.newId(),
                listing.id(),
                listing.merchantId(),
                listing.spuId(),
                skus.skuIds(listing.spuId()),
                detail.categoryId(),
                detail.minPrice(),
                Instant.now()));
    }

    private Listing requireOffer(UUID listingId) {
        return listings.find(listingId).orElseThrow(() -> BusinessException.notFound("listing 不存在: " + listingId));
    }

    /** 发布闸门。编辑链路（{@code SellerProductEditService}）复用同一份，不复制——两处判断迟早会漂。 */
    CategoryRow requireCategory(UUID categoryId) {
        CategoryRow category =
                categories.find(categoryId).orElseThrow(() -> BusinessException.notFound("类目不存在: " + categoryId));
        if (!category.status().sellable()) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_DISABLED, "类目已停用");
        }
        if (!category.leaf()) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_NOT_LEAF, "商品只能挂叶子类目");
        }
        return category;
    }

    /**
     * 新挂入的类目闸门：必须叶子 + {@code active}。
     *
     * <p>{@code frozen} 的语义是「禁新挂入、存量卖完为止」。只判 {@code sellable()}
     * （active | frozen）会让冻结类目继续接受新商品，和文档相反。
     */
    CategoryRow requireMountableCategory(UUID categoryId) {
        CategoryRow category =
                categories.find(categoryId).orElseThrow(() -> BusinessException.notFound("类目不存在: " + categoryId));
        if (!category.leaf()) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_NOT_LEAF, "商品只能挂叶子类目");
        }
        if (!category.mountable()) {
            throw BusinessException.badRequest(
                    ErrorCodes.CATEGORY_DISABLED,
                    "类目已停用或冻结，不能新增商品挂入: " + category.status().dbValue());
        }
        return category;
    }

    /**
     * 叶子的配置。没有配置行说明这个类目没配齐，不能挂商品。
     *
     * <p>这里不再需要"沿祖先链解析"——配置只挂在叶子上，一条 {@code WHERE category_id = ?} 就够。
     */
    /** 发布闸门。见 {@link #requireCategory}。 */
    CategoryConfig requireConfig(UUID categoryId) {
        return configs.find(categoryId)
                .orElseThrow(() -> BusinessException.badRequest(
                        ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "该类目还没有配置，不能挂商品: " + categoryId));
    }

    /**
     * 条码闸门。
     *
     * <p><b>只有「只能用 GTIN 识别」的类目才强制条码。</b> 类目同时声明了 {@code gtin} 和
     * {@code param_hash} 时，白牌货本来就走参数哈希（product-model.md §2.1）——强制条码
     * 等于逼商家编一个假号。只有类目只认 GTIN、商家又不填，才会静默丢掉规格身份：比价聚不到一起、
     * 售后认不出是哪个规格，而买家那侧毫无征兆。
     */
    void checkBarcodes(CategoryConfig config, List<SkuSpecInput> skus) {
        List<String> kinds = config.skuIdentityKinds();
        boolean gtinOnly =
                kinds.contains("gtin") && !kinds.contains("param_hash") && !kinds.contains(IdentityKind.NONE.dbValue());
        if (!gtinOnly) {
            return;
        }
        for (SkuSpecInput sku : skus) {
            if (sku.barcode() == null || sku.barcode().isBlank()) {
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "该类目要求填写商品条码（GTIN），否则无法比价和识别规格");
            }
        }
    }

    /**
     * 属性值表：{@code attributeId -> 值列表}。
     *
     * <p>同一个 attributeId 出现多次就是多值属性的多个取值。非多值属性会在闸门里被拒；
     * 完全相同的重复值在这里去重，避免 {@code spu_attr} 主键冲突变成 500。
     */
    static Map<UUID, List<String>> createAttributeValues(List<CreateProductRequest.AttributeRequest> attributes) {
        return groupAttributes(
                attributes,
                CreateProductRequest.AttributeRequest::attributeId,
                CreateProductRequest.AttributeRequest::value);
    }

    /** 编辑链路的版本。两个 DTO 形状一样但类型不同，没法共用一个 List 签名。 */
    static Map<UUID, List<String>> updateAttributeValues(List<UpdateProductRequest.AttributeRequest> attributes) {
        return groupAttributes(
                attributes,
                UpdateProductRequest.AttributeRequest::attributeId,
                UpdateProductRequest.AttributeRequest::value);
    }

    private static <T> Map<UUID, List<String>> groupAttributes(
            List<T> attributes, java.util.function.Function<T, UUID> id, java.util.function.Function<T, String> value) {
        Map<UUID, List<String>> values = new LinkedHashMap<>();
        if (attributes == null) {
            return values;
        }
        for (T attribute : attributes) {
            List<String> entries = values.computeIfAbsent(id.apply(attribute), key -> new ArrayList<>());
            String entry = value.apply(attribute);
            if (!entries.contains(entry)) {
                entries.add(entry);
            }
        }
        return values;
    }

    /** 库里已有的属性值，按 {@code attributeId} 聚合成多值。提交前复验和识别键重算都用它。 */
    Map<UUID, List<String>> storedAttributeValues(UUID spuId) {
        Map<UUID, List<String>> values = new LinkedHashMap<>();
        for (SpuAttrMapper.AttributeValueRow row : attributes.findValues(spuId)) {
            values.computeIfAbsent(row.attributeId(), key -> new ArrayList<>()).add(row.value());
        }
        return values;
    }

    /**
     * 属性落库。按 {@code value_index} 递增写多值——只写 {@code value_index = 0}
     * 会让 {@code is_multi} 变成一句空话，第二条值直接撞主键。
     */
    void insertAttributes(UUID spuId, CategoryConfig config, Map<UUID, List<String>> values) {
        if (values.isEmpty()) {
            return;
        }
        Map<UUID, CategoryConfig.AttributeView> byId = config.attributes().stream()
                .collect(Collectors.toMap(CategoryConfig.AttributeView::id, attribute -> attribute));
        for (Map.Entry<UUID, List<String>> entry : values.entrySet()) {
            CategoryConfig.AttributeView definition = byId.get(entry.getKey());
            if (definition == null) {
                // 闸门已经拦过；走到这里说明调用方绕过了闸门，不能静默丢值
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "这个属性不属于该类目: " + entry.getKey());
            }
            int index = 0;
            for (String value : entry.getValue()) {
                attributes.insertAttribute(
                        spuId, entry.getKey(), ValueType.from(definition.valueType()), index++, value);
            }
        }
    }

    /** 品牌名进识别键：两个品牌同型号不能撞 {@code uq_spu_standard_match}。 */
    private String brandName(UUID brandId) {
        if (brandId == null) {
            return "";
        }
        return brands.findApprovedName(brandId)
                .orElseThrow(
                        () -> BusinessException.badRequest(ErrorCodes.BRAND_NOT_AVAILABLE, "品牌不存在或未通过审核: " + brandId));
    }

    /** 发布闸门。见 {@link #requireCategory}。 */
    void checkBrandPolicy(BrandPolicy policy, UUID brandId) {
        if (policy == BrandPolicy.REQUIRED && brandId == null) {
            throw BusinessException.badRequest(ErrorCodes.BRAND_REQUIRED, "该类目必须选择品牌");
        }
        if (policy == BrandPolicy.FORBIDDEN && brandId != null) {
            throw BusinessException.badRequest(ErrorCodes.BRAND_FORBIDDEN, "该类目不允许选择品牌");
        }
        if (brandId != null && brands.findApprovedName(brandId).isEmpty()) {
            throw BusinessException.badRequest(ErrorCodes.BRAND_NOT_AVAILABLE, "品牌不存在或未通过审核: " + brandId);
        }
    }

    /**
     * 类目要求必填的属性，商品必须都填了。
     *
     * <p>这条闸门之前完全不存在：属性模板的 {@code is_required} 一次都没被读过，
     * 所以「类目要求必填」在库里是一句空话。属性 id 还必须属于这个类目——
     * 否则能把「屏幕尺寸」填到连衣裙上，而商品详情照显示。
     *
     * <p><b>入参是 {@code attributeId -> 值列表} 而不是某个 DTO 列表。</b>
     * 创建与编辑用的是两个不同的请求类型，但闸门判的只是「这个类目的必填项齐不齐、
     * 值在不在域内」——绑定到 DTO 会让编辑链路要么复制一份判断，要么把两个 DTO 合并。
     */
    void checkRequiredAttributes(CategoryConfig config, Map<UUID, List<String>> values) {
        validateAttributes(config, values, true);
    }

    /**
     * 存量属性值的复验：提交 / 重新上架前跑。
     *
     * <p>下线的属性不再校验、也不拒——「属性只增不删，下线后存量值保留」。
     * 新写入走 {@link #checkRequiredAttributes}，那里会拒绝往已下线属性里填新值。
     */
    void checkStoredAttributes(CategoryConfig config, Map<UUID, List<String>> values) {
        validateAttributes(config, values, false);
    }

    private void validateAttributes(CategoryConfig config, Map<UUID, List<String>> values, boolean rejectInactive) {
        for (CategoryConfig.AttributeView attribute : config.attributes()) {
            if (!"active".equals(attribute.status())) {
                continue;
            }
            List<String> provided = values.get(attribute.id());
            boolean filled = provided != null && !provided.isEmpty();
            // 规格属性的 required 语义是「每条 SKU 都必须有这个维度」，不是 SPU 级填一个值
            if (attribute.required() && !attribute.salesSpec() && !filled) {
                throw BusinessException.badRequest(
                        ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "类目要求必填属性: " + attribute.name());
            }
            if (!filled) {
                continue;
            }
            if (!attribute.multi() && provided.size() > 1) {
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, attribute.name() + " 不支持多值");
            }
            for (String value : provided) {
                if (value == null || value.isBlank()) {
                    throw BusinessException.badRequest(
                            ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, attribute.name() + " 的值不能为空");
                }
                if (!valueAllowed(attribute, value, rejectInactive)) {
                    throw BusinessException.badRequest(
                            ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, attribute.name() + " 的取值不在值域内: " + value);
                }
                checkValueShape(attribute, value);
            }
        }
        // 反方向：填了不属于这个类目的属性；新写入时还要拒绝已下线的属性
        Map<UUID, CategoryConfig.AttributeView> allowed = config.attributes().stream()
                .collect(Collectors.toMap(CategoryConfig.AttributeView::id, attribute -> attribute));
        for (UUID attributeId : values.keySet()) {
            CategoryConfig.AttributeView attribute = allowed.get(attributeId);
            if (attribute == null) {
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "这个属性不属于该类目: " + attributeId);
            }
            if (rejectInactive && !"active".equals(attribute.status())) {
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "属性已下线，不能再填: " + attribute.name());
            }
        }
    }

    /**
     * 值是否被模板接受。新写入只认 active 值；存量复验认全部值（停用后存量仍能重提）。
     * 枚举允许自定义值时，缺的值顺手落成 seller 值——否则「允许自定义」只是一句空话。
     */
    private boolean valueAllowed(CategoryConfig.AttributeView attribute, String value, boolean rejectInactive) {
        List<String> allowed = rejectInactive ? attribute.activeValueTexts() : attribute.allValueTexts();
        if (allowed.contains(value)) {
            return true;
        }
        if (rejectInactive && attribute.allowCustom() && ValueType.from(attribute.valueType()) == ValueType.ENUM) {
            configs.ensureSellerValue(attribute.id(), value);
            return true;
        }
        // 非枚举（text / number / bool）没有值域，自由文本
        return allowed.isEmpty() && ValueType.from(attribute.valueType()) != ValueType.ENUM;
    }

    /**
     * 违禁词闸门：标题 / 副标题。草稿不拦，提交与非草稿编辑必须过。
     * 错误按字段返回，前端读 {@code errors[].field} 标红（标题字段名沿用旧契约 {@code name}）。
     */
    void checkForbiddenWords(String title, String subtitle) {
        List<Map<String, String>> errors = new ArrayList<>();
        forbiddenWords
                .firstHit(title)
                .ifPresent(word -> errors.add(Map.of("field", "name", "message", "标题命中违禁词", "value", word)));
        forbiddenWords
                .firstHit(subtitle)
                .ifPresent(word -> errors.add(Map.of("field", "subtitle", "message", "副标题命中违禁词", "value", word)));
        if (!errors.isEmpty()) {
            throw BusinessException.badRequest(ErrorCodes.FORBIDDEN_WORD_HIT, "内容命中违禁词", errors);
        }
    }

    /** 商家货号：同商家内唯一，空值不占用。 */
    void validateMerchantCode(UUID merchantId, String code, UUID excludeSkuId, Set<String> seen) {
        if (code == null || code.isBlank()) {
            return;
        }
        String normalized = code.trim();
        if (!seen.add(normalized.toLowerCase(java.util.Locale.ROOT))) {
            throw BusinessException.conflict("同一个请求里商家编码重复: " + normalized);
        }
        if (skus.merchantCodeTaken(merchantId, normalized, excludeSkuId)) {
            throw BusinessException.conflict("商家编码已被占用: " + normalized);
        }
    }

    private static void validateSkuPrice(Money price, Money originalPrice) {
        if (!"CNY".equals(price.currency())) {
            throw BusinessException.badRequest("sku 价格只支持 CNY: " + price.currency());
        }
        if (originalPrice != null) {
            if (!"CNY".equals(originalPrice.currency())) {
                throw BusinessException.badRequest("划线价只支持 CNY: " + originalPrice.currency());
            }
            if (originalPrice.amount() < price.amount()) {
                throw BusinessException.badRequest("划线价不能低于售价");
            }
        }
    }

    /** 规格图：属性必须是当前类目的 active 规格属性，值必须在值域内。 */
    void insertSpecImages(UUID spuId, CategoryConfig config, List<SpecImageRequest> specImages) {
        if (specImages == null || specImages.isEmpty()) {
            medias.replaceSpecImages(spuId, List.of());
            return;
        }
        Map<UUID, CategoryConfig.AttributeView> specAttributes = activeSpecAttributes(config);
        Map<String, SpuMediaMapper.SpecImage> deduped = new LinkedHashMap<>();
        for (SpecImageRequest image : specImages) {
            CategoryConfig.AttributeView attribute = specAttributes.get(image.attributeId());
            if (attribute == null) {
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "规格图属性必须是启用中的规格属性: " + image.attributeId());
            }
            validateSpecValue(attribute, image.value(), true);
            deduped.put(
                    image.attributeId() + "=" + image.value(),
                    new SpuMediaMapper.SpecImage(image.attributeId(), image.value(), image.imageUrl()));
        }
        medias.replaceSpecImages(spuId, List.copyOf(deduped.values()));
    }

    /**
     * 值能不能按属性类型落库。
     *
     * <p>数字属性的值要进 {@code value_num}、布尔的进 {@code value_bool}，
     * 落不进去就是数据库报类型错（500）。在这里拦住，前端能拿到能定位字段的码。
     *
     * <p>数字还要求必须带单位（类目配置时已强制），否则 1m 和 100cm 是两个值——
     * 那一步在 {@code CatalogConfigService} 建模板时校验，这里只判格式。
     */
    private void checkValueShape(CategoryConfig.AttributeView attribute, String value) {
        switch (ValueType.from(attribute.valueType())) {
            case NUMBER -> {
                try {
                    new java.math.BigDecimal(value);
                } catch (NumberFormatException e) {
                    throw BusinessException.badRequest(
                            ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, attribute.name() + " 必须是数字: " + value);
                }
            }
            case BOOL -> {
                if (!"true".equalsIgnoreCase(value) && !"false".equalsIgnoreCase(value)) {
                    throw BusinessException.badRequest(
                            ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN,
                            attribute.name() + " 必须是 true / false: " + value);
                }
            }
            default -> {
                // text / enum 走 value_text，没有格式要求（enum 的值域已在上面判过）
            }
        }
    }

    /**
     * 新写入的 SKU 规格闸门。
     *
     * <p>三件事：每条 SKU 的规格维度必须一致（缺组合靠少一行 SKU 表达，不是靠少一个维度）、
     * 每个维度必须是类目标了 {@code is_sales_spec} 的属性、取值必须在值域内。
     *
     * <p><b>维度一致很重要。</b> 允许「红/L」和只有「红」的两条 SKU 同时存在，
     * 买家看到的规格表就是错的，而比价会按两个不同的哈希把同一件商品拆开。
     */
    void checkSpecAttributes(CategoryConfig config, List<SkuSpecInput> skus) {
        if (skus.isEmpty()) {
            return;
        }
        Map<UUID, CategoryConfig.AttributeView> specAttributes = activeSpecAttributes(config);
        Set<UUID> dimensions = null;
        boolean sawEmpty = false;
        for (SkuSpecInput sku : skus) {
            Set<UUID> keys = sku.specs() == null ? Set.of() : sku.specs().keySet();
            if (keys.isEmpty()) {
                sawEmpty = true;
                if (dimensions != null && !dimensions.isEmpty()) {
                    throw BusinessException.badRequest(
                            ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "同一商品下每条 SKU 的规格维度必须一致");
                }
                continue;
            }
            if (sawEmpty) {
                throw BusinessException.badRequest(ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "同一商品下每条 SKU 的规格维度必须一致");
            }
            if (dimensions == null) {
                dimensions = keys;
            } else if (!dimensions.equals(keys)) {
                throw BusinessException.badRequest(ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "同一商品下每条 SKU 的规格维度必须一致");
            }
            validateSpecValues(specAttributes, sku.specs());
        }
        // 全部为空也要跑：类目若把某个规格标了必填，空规格就必须被拒。
        requireSpecDimensions(config, dimensions == null ? Set.of() : dimensions);
    }

    /**
     * 存量 SKU 的复验：提交 / 重新上架前跑。
     *
     * <p>不校验维度一致性和必填维度——存量数据可能是在这些规则之前建的，重提不能被历史数据卡死。
     * 已下线的规格属性也跳过：「属性下线后存量值保留」。仍然校验的是值域与空值。
     */
    void checkStoredSpecs(CategoryConfig config, List<SkuSpecInput> skus) {
        Map<UUID, CategoryConfig.AttributeView> specAttributes = config.attributes().stream()
                .filter(CategoryConfig.AttributeView::salesSpec)
                .collect(Collectors.toMap(CategoryConfig.AttributeView::id, attribute -> attribute));
        for (SkuSpecInput sku : skus) {
            if (sku.specs() == null || sku.specs().isEmpty()) {
                continue;
            }
            for (Map.Entry<UUID, String> spec : sku.specs().entrySet()) {
                CategoryConfig.AttributeView attribute = specAttributes.get(spec.getKey());
                if (attribute == null) {
                    throw BusinessException.badRequest(
                            ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN,
                            "这个属性不能当规格（类目没有标 is_sales_spec）: " + spec.getKey());
                }
                if (!"active".equals(attribute.status())) {
                    continue;
                }
                validateSpecValue(attribute, spec.getValue(), false);
            }
        }
    }

    private static Map<UUID, CategoryConfig.AttributeView> activeSpecAttributes(CategoryConfig config) {
        return config.attributes().stream()
                .filter(CategoryConfig.AttributeView::salesSpec)
                .filter(attribute -> "active".equals(attribute.status()))
                .collect(Collectors.toMap(CategoryConfig.AttributeView::id, attribute -> attribute));
    }

    private void validateSpecValues(Map<UUID, CategoryConfig.AttributeView> specAttributes, Map<UUID, String> specs) {
        for (Map.Entry<UUID, String> spec : specs.entrySet()) {
            CategoryConfig.AttributeView attribute = specAttributes.get(spec.getKey());
            if (attribute == null) {
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN,
                        "这个属性不能当规格（类目没有标 is_sales_spec 或已下线）: " + spec.getKey());
            }
            validateSpecValue(attribute, spec.getValue(), true);
        }
    }

    private void validateSpecValue(CategoryConfig.AttributeView attribute, String value, boolean rejectInactive) {
        if (value == null || value.isBlank()) {
            throw BusinessException.badRequest(
                    ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, attribute.name() + " 的规格值不能为空");
        }
        if (!valueAllowed(attribute, value, rejectInactive)) {
            List<String> allowed = rejectInactive ? attribute.activeValueTexts() : attribute.allValueTexts();
            throw BusinessException.badRequest(
                    ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN,
                    attribute.name() + " 的取值不在值域内: " + value + "，可选 " + String.join(" / ", allowed));
        }
    }

    private static void requireSpecDimensions(CategoryConfig config, Set<UUID> dimensions) {
        if (dimensions == null) {
            return;
        }
        for (CategoryConfig.AttributeView attribute : config.attributes()) {
            if (!attribute.salesSpec() || !attribute.required() || !"active".equals(attribute.status())) {
                continue;
            }
            if (!dimensions.contains(attribute.id())) {
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "缺少必填规格维度: " + attribute.name());
            }
        }
    }

    /** 提交前复验用：从库里读出每个 SKU 的规格值与条码。 */
    List<SkuSpecInput> storedSkuInputs(UUID spuId) {
        return skus.findSpecRows(spuId).stream()
                .map(row -> new SkuSpecInput(readSpecs(row.specValuesJson()), row.barcode()))
                .toList();
    }

    /** 规格 JSON 的解析。创建时是 DTO 里的 map，复验时是库里的 jsonb 原文。 */
    static Map<UUID, String> readSpecs(String raw) {
        if (raw == null || raw.isBlank()) {
            return Map.of();
        }
        Map<UUID, String> parsed = JsonColumns.read(raw, new TypeReference<Map<UUID, String>>() {});
        return parsed == null ? Map.of() : Map.copyOf(parsed);
    }

    /**
     * 规格闸门的输入：一个 SKU 的规格值与条码。
     *
     * <p>创建、新增 SKU、提交前复验三处走同一份校验，只是数据来源不同。
     */
    record SkuSpecInput(Map<UUID, String> specs, String barcode) {}

    /**
     * 售卖资格。
     *
     * @param config 类目配置。{@code qualification_codes} 必须传进去——资质要求是 catalog 的配置，
     *     governance 不该反向读它（那会成环），所以由这边取出来交给它判
     */
    /** 发布闸门。见 {@link #requireCategory}。 */
    void checkGovernance(UUID merchantId, UUID categoryId, UUID brandId, CategoryConfig config) {
        SellDecision decision = governance.canSell(merchantId, categoryId, brandId, config.qualificationCodes());
        if (!decision.allowed()) {
            throw BusinessException.forbidden(decision.reasonCode(), "没有售卖资格: " + decision.reasonCode());
        }
    }

    private UUID requireSeller(CurrentOperator operator) {
        if (!CurrentOperator.TYPE_SELLER.equals(operator.operatorType()) || operator.merchantId() == null) {
            throw BusinessException.forbidden("SELLER_ONLY", "只有卖家可以操作商品");
        }
        return operator.merchantId();
    }
}
