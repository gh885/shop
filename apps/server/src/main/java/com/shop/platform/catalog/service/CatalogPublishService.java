package com.shop.platform.catalog.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.catalog.dto.CreateProductRequest;
import com.shop.platform.catalog.dto.OfferResult;
import com.shop.platform.catalog.dto.ProductDetail;
import com.shop.platform.catalog.events.OfferOffline;
import com.shop.platform.catalog.events.OfferPublished;
import com.shop.platform.catalog.mapper.BrandStore;
import com.shop.platform.catalog.mapper.CategoryConfigStore;
import com.shop.platform.catalog.mapper.CategoryStore;
import com.shop.platform.catalog.mapper.OfferStore;
import com.shop.platform.catalog.mapper.ProductStore;
import com.shop.platform.catalog.model.BrandPolicy;
import com.shop.platform.catalog.model.CategoryConfig;
import com.shop.platform.catalog.model.Offer;
import com.shop.platform.catalog.model.OfferStatus;
import com.shop.platform.catalog.model.ValueType;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.trust.api.SellDecision;
import com.shop.platform.trust.api.TrustQuery;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 商品发布的核心流程：建 SPU/SKU → 提交 offer → 免审类目自动上架。
 *
 * <p>这一版刻意不做平台人工审核和完整 CRUD：人工审核需要 staff 身份，先由 auto_approve 类目把
 * “发布 → 上架 → 买家可见”跑通；审核服务方法先留着，等 staff 登录接上再开 controller。
 */
@Component
public class CatalogPublishService {

    private final CategoryStore categories;
    private final CategoryConfigStore configs;
    private final BrandStore brands;
    private final IdentityKeyResolver identityKeys;
    private final StandardMatcher standard;
    private final ProductStore products;
    private final OfferStore offers;
    private final TrustQuery trust;
    private final AuditCommand audit;
    private final ApplicationEventPublisher events;

    public CatalogPublishService(
            CategoryStore categories,
            CategoryConfigStore configs,
            BrandStore brands,
            IdentityKeyResolver identityKeys,
            StandardMatcher standard,
            ProductStore products,
            OfferStore offers,
            TrustQuery trust,
            AuditCommand audit,
            ApplicationEventPublisher events) {
        this.categories = Objects.requireNonNull(categories, "categories");
        this.configs = Objects.requireNonNull(configs, "configs");
        this.brands = Objects.requireNonNull(brands, "brands");
        this.identityKeys = Objects.requireNonNull(identityKeys, "identityKeys");
        this.standard = Objects.requireNonNull(standard, "standard");
        this.products = Objects.requireNonNull(products, "products");
        this.offers = Objects.requireNonNull(offers, "offers");
        this.trust = Objects.requireNonNull(trust, "trust");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.events = Objects.requireNonNull(events, "events");
    }

    @Transactional
    public UUID createDraft(CreateProductRequest request, CurrentOperator operator) {
        UUID merchantId = requireSeller(operator);
        CategoryStore.CategoryRow category = requireCategory(request.categoryId());
        CategoryConfig config = requireConfig(category.id());
        checkBrandPolicy(BrandPolicy.from(config.brandPolicy()), request.brandId());
        checkTrust(merchantId, category.id(), request.brandId(), config);
        checkRequiredAttributes(config, request.attributes());
        checkSpecAttributes(config, request.skus());
        checkBarcodes(config, request.skus());

        Set<String> specKeys = new HashSet<>();
        for (CreateProductRequest.SkuRequest sku : request.skus()) {
            String key = ProductStore.specKey(sku.specs());
            if (!specKeys.add(key)) {
                throw BusinessException.conflict(ErrorCodes.DUPLICATE_SKU_SPEC, "同一 SPU 下规格组合重复: " + key);
            }
        }

        // 识别键由 resolver 统一算，不在这里拼——"怎么认商品"只能有一处判断
        IdentityKeyResolver.ResolvedIdentity identity = identityKeys.resolveSpu(
                config, request.modelNo(), brandName(request.brandId()), attributeValues(request));
        Map<UUID, String> specValues = specValues(request);

        UUID spuId = Ids.newId();
        products.insertSpu(
                spuId,
                merchantId,
                category.id(),
                request.brandId(),
                request.title(),
                request.modelNo(),
                identity.kind(),
                identity.matchKey(),
                request.images());

        for (CreateProductRequest.SkuRequest sku : request.skus()) {
            products.insertSku(
                    Ids.newId(),
                    spuId,
                    sku.specs(),
                    sku.price(),
                    sku.weightG(),
                    sku.barcode(),
                    identityKeys.resolveSku(config, sku.barcode(), specValues));
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
        if (request.attributes() != null) {
            Map<UUID, CategoryConfig.AttributeView> byId = config.attributes().stream()
                    .collect(Collectors.toMap(CategoryConfig.AttributeView::id, attribute -> attribute));
            for (CreateProductRequest.AttributeRequest attribute : request.attributes()) {
                // checkRequiredAttributes 已经确认过这个 id 属于该类目，这里不会拿到 null
                CategoryConfig.AttributeView definition = byId.get(attribute.attributeId());
                products.insertAttribute(
                        spuId, attribute.attributeId(), ValueType.from(definition.valueType()), attribute.value());
            }
        }
        return spuId;
    }

    /**
     * 提交挂售。
     *
     * <p><b>驳回后重提走的是同一条 offer，不是新建一条。</b> 这是文档定的：
     * 「驳回后重提是改原 offer，不是新建一条。否则反复驳回会让同一个商品长出一堆记录，
     * 唯一约束也保不住」。
     *
     * <p>原来这里只会新建 offer，撞 {@code uq_offer_spu_shop} 直接 409，于是
     * {@code REJECTED → PENDING} 那条状态机永远走不到、{@code round} 永远是 1、
     * {@code uq_offer_review_round} 永远不触发——状态机和表约束都写了，代码没接。
     *
     * <p>三条分支：
     *
     * <ul>
     *   <li>没 offer → 新建，pending
     *   <li>已 rejected / offline → 回 pending，round+1（重提）
     *   <li>已 pending / approved / online → 409，不该重复提交
     * </ul>
     */
    @Transactional
    public OfferResult submitOffer(UUID spuId, UUID shopId, CurrentOperator operator) {
        UUID merchantId = requireSeller(operator);
        if (!operator.canOperateShop(shopId)) {
            throw BusinessException.forbidden("SHOP_NOT_OPERABLE", "无权操作店铺: " + shopId);
        }

        ProductStore.PublishRow spu =
                products.findForPublish(spuId).orElseThrow(() -> BusinessException.notFound("商品不存在: " + spuId));
        if (!spu.merchantId().equals(merchantId)) {
            throw BusinessException.forbidden("SPU_NOT_OWNED", "商品不属于当前商家");
        }

        CategoryStore.CategoryRow category = requireCategory(spu.categoryId());
        CategoryConfig config = requireConfig(category.id());
        checkTrust(merchantId, category.id(), spu.brandId(), config);

        Offer offer = offers.findBySpuAndShop(spuId, shopId)
                .map(existing -> resubmit(existing))
                .orElseGet(() -> createPending(spuId, merchantId, shopId));

        if (!config.autoApprove()) {
            return new OfferResult(offer.id(), offer.status());
        }

        Offer approved = offer.transitionTo(OfferStatus.APPROVED);
        if (!offers.transition(offer, OfferStatus.APPROVED, null, null)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
        }
        Offer online = approved.transitionTo(OfferStatus.ONLINE);
        if (!offers.transition(approved, OfferStatus.ONLINE, null, null)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
        }
        offers.review(offer.id(), offers.nextRound(offer.id()), "approved", "auto_approve", null);
        audit.record(AuditEntry.bySystem(
                "catalog.offer.approved",
                "offer",
                offer.id().toString(),
                Map.of("status", FieldChange.of("pending", "online"))));
        publish(online);
        return new OfferResult(online.id(), online.status());
    }

    private Offer createPending(UUID spuId, UUID merchantId, UUID shopId) {
        Offer pending = Offer.draft(spuId, merchantId, shopId).transitionTo(OfferStatus.PENDING);
        offers.insert(pending);
        return pending;
    }

    /**
     * 驳回 / 下架后重提：同一条 offer 回 pending。
     *
     * <p>{@code PENDING} 或更后的状态一律拒——重复提交会让审核队列里出现同一商品两次。
     */
    private Offer resubmit(Offer existing) {
        if (existing.status() == OfferStatus.PENDING
                || existing.status() == OfferStatus.APPROVED
                || existing.status() == OfferStatus.ONLINE) {
            throw BusinessException.conflict("OFFER_ALREADY_EXISTS", "这个商品已经在该店铺挂售，当前状态: " + existing.status());
        }
        Offer pending = existing.transitionTo(OfferStatus.PENDING);
        if (!offers.transition(existing, OfferStatus.PENDING, null, null)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
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
    public void approveOffer(UUID offerId, UUID reviewerId) {
        Offer pending = requireOffer(offerId);
        Offer approved = pending.transitionTo(OfferStatus.APPROVED);
        if (!offers.transition(pending, OfferStatus.APPROVED, reviewerId, null)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
        }
        offers.review(offerId, offers.nextRound(offerId), "approved", "manual", reviewerId);

        Offer online = approved.transitionTo(OfferStatus.ONLINE);
        if (!offers.transition(approved, OfferStatus.ONLINE, reviewerId, null)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
        }
        audit.record(AuditEntry.byStaff(
                "catalog.offer.approved",
                "offer",
                offerId.toString(),
                reviewerId,
                online.merchantId(),
                Map.of("status", FieldChange.of("pending", "online"))));
        publish(online);
    }

    /**
     * 下架。<b>只有 online 能下</b>——pending 的商品还没上过架，
     * 谈不上下架；那种情况要拦提交，走 {@link #rejectOffer}。
     *
     * <p>{@code OFFLINE → PENDING} 那条迁移是给商家重提用的，平台侧不直接走它：
     * 平台下架后要不要让商家原样重提，是治理决策，不是一个 HTTP 接口能替商家决定的。
     */
    @Transactional
    public void offlineOffer(UUID offerId, UUID operatorId, String reason) {
        Offer online = requireOffer(offerId);
        Offer offline = online.transitionTo(OfferStatus.OFFLINE);
        if (!offers.transition(online, OfferStatus.OFFLINE, operatorId, reason)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
        }
        audit.record(AuditEntry.byStaff(
                "catalog.offer.offline",
                "offer",
                offerId.toString(),
                operatorId,
                offline.merchantId(),
                Map.of("status", FieldChange.of("online", "offline"), "reason", FieldChange.to(reason))));
        // 事件必须发：只发上架不发下架，搜索索引里会永远留着这条商品，        // 买家点进去 404 而后台显示"已下架"（product-model.md §5 失败模式第一条）
        events.publishEvent(new OfferOffline(
                Ids.newId(), offerId, offline.merchantId(), offline.spuId(), offline.shopId(), Instant.now()));
    }

    /** 审核通过后上架。 */
    @Transactional
    public void publishOffer(UUID offerId, UUID reviewerId) {
        Offer approved = requireOffer(offerId);
        Offer online = approved.transitionTo(OfferStatus.ONLINE);
        if (!offers.transition(approved, OfferStatus.ONLINE, reviewerId, null)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
        }
        // 不再写 spu.status：那个列已删。可售状态只有一个来源——offer.status。
        audit.record(AuditEntry.byStaff(
                "catalog.offer.approved",
                "offer",
                offerId.toString(),
                reviewerId,
                online.merchantId(),
                Map.of("status", FieldChange.of("approved", "online"))));
        publish(online);
    }

    /**
     * 人工驳回。<b>理由必填。</b>
     *
     * <p>空理由的驳回，商家只知道"没过"，不知道该改什么——他会原样重提，
     * 然后你再驳回一次，round +1，两边都白费。这条理由同时进 {@code offer_review.reason}
     * 和审计，是商家唯一能看见的反馈渠道。
     */
    @Transactional
    public void rejectOffer(UUID offerId, UUID reviewerId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw BusinessException.badRequest("REJECT_REASON_REQUIRED", "驳回必须填理由，否则商家不知道该改什么");
        }
        Offer pending = requireOffer(offerId);
        Offer rejected = pending.transitionTo(OfferStatus.REJECTED);
        if (!offers.transition(pending, OfferStatus.REJECTED, reviewerId, reason)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
        }
        offers.review(offerId, offers.nextRound(offerId), "rejected", reason, reviewerId);
        audit.record(AuditEntry.byStaff(
                "catalog.offer.rejected",
                "offer",
                offerId.toString(),
                reviewerId,
                rejected.merchantId(),
                Map.of("status", FieldChange.of("pending", "rejected"), "reason", FieldChange.to(reason))));
    }

    /** 审核队列。FIFO，给平台运营看。 */
    public List<OfferStore.PendingOffer> pendingOffers(int limit) {
        return offers.findPending(limit);
    }

    public ProductDetail product(UUID spuId) {
        return products.findOnlineDetail(spuId).orElseThrow(() -> BusinessException.notFound("商品不存在或未上架: " + spuId));
    }

    private void publish(Offer offer) {
        ProductDetail detail = products.findOnlineDetail(offer.spuId())
                .orElseThrow(() -> new IllegalStateException("刚上架的商品读不到: " + offer.spuId()));
        events.publishEvent(new OfferPublished(
                Ids.newId(),
                offer.id(),
                offer.merchantId(),
                offer.spuId(),
                products.skuIds(offer.spuId()),
                detail.categoryId(),
                detail.minPrice(),
                Instant.now()));
    }

    private Offer requireOffer(UUID offerId) {
        return offers.find(offerId).orElseThrow(() -> BusinessException.notFound("offer 不存在: " + offerId));
    }

    private CategoryStore.CategoryRow requireCategory(UUID categoryId) {
        CategoryStore.CategoryRow category =
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
     * 叶子的配置。没有配置行说明这个类目没配齐，不能挂商品。
     *
     * <p>这里不再需要"沿祖先链解析"——配置只挂在叶子上，一条 {@code WHERE category_id = ?} 就够。
     */
    private CategoryConfig requireConfig(UUID categoryId) {
        return configs.find(categoryId)
                .orElseThrow(() -> BusinessException.badRequest(
                        ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "该类目还没有配置，不能挂商品: " + categoryId));
    }

    /**
     * 类目声明了 {@code gtin} 就必须给条码。
     *
     * <p>不填就静默丢失规格身份：比价聚不到一起、售后认不出是哪个规格。
     * 而这两件事在买家那一侧毫无征兆——只是"搜不到"和"退错货"。
     */
    private void checkBarcodes(CategoryConfig config, List<CreateProductRequest.SkuRequest> skus) {
        if (!config.skuIdentityKinds().contains("gtin")) {
            return;
        }
        for (CreateProductRequest.SkuRequest sku : skus) {
            if (sku.barcode() == null || sku.barcode().isBlank()) {
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "该类目要求填写商品条码（GTIN），否则无法比价和识别规格");
            }
        }
    }

    /** 属性值表。识别键计算要用——它只认 attributeId → 值。 */
    private static Map<UUID, String> attributeValues(CreateProductRequest request) {
        Map<UUID, String> values = new HashMap<>();
        if (request.attributes() != null) {
            for (CreateProductRequest.AttributeRequest attribute : request.attributes()) {
                values.put(attribute.attributeId(), attribute.value());
            }
        }
        return values;
    }

    /** 规格值表。每个 SKU 的规格是一样的（同 SPU 下规格组合唯一），取第一个就够。 */
    private static Map<UUID, String> specValues(CreateProductRequest request) {
        if (request.skus().isEmpty()) {
            return Map.of();
        }
        return request.skus().getFirst().specs();
    }

    /** 品牌名进识别键：两个品牌同型号不能撞 {@code uq_spu_standard_match}。 */
    private String brandName(UUID brandId) {
        if (brandId == null) {
            return "";
        }
        return brands.findName(brandId).orElse("");
    }

    private void checkBrandPolicy(BrandPolicy policy, UUID brandId) {
        if (policy == BrandPolicy.REQUIRED && brandId == null) {
            throw BusinessException.badRequest(ErrorCodes.BRAND_REQUIRED, "该类目必须选择品牌");
        }
        if (policy == BrandPolicy.FORBIDDEN && brandId != null) {
            throw BusinessException.badRequest(ErrorCodes.BRAND_FORBIDDEN, "该类目不允许选择品牌");
        }
    }

    /**
     * 类目要求必填的属性，商品必须都填了。
     *
     * <p>这条闸门之前完全不存在：属性模板的 {@code is_required} 一次都没被读过，
     * 所以「类目要求必填」在库里是一句空话。属性 id 还必须属于这个类目——
     * 否则能把「屏幕尺寸」填到连衣裙上，而商品详情照显示。
     */
    private void checkRequiredAttributes(CategoryConfig config, List<CreateProductRequest.AttributeRequest> provided) {
        Map<UUID, String> values = new HashMap<>();
        if (provided != null) {
            for (CreateProductRequest.AttributeRequest attribute : provided) {
                values.put(attribute.attributeId(), attribute.value());
            }
        }
        for (CategoryConfig.AttributeView attribute : config.attributes()) {
            if (!"active".equals(attribute.status())) {
                continue;
            }
            boolean filled = values.containsKey(attribute.id());
            if (attribute.required() && !filled) {
                throw BusinessException.badRequest(
                        ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "类目要求必填属性: " + attribute.name());
            }
            if (filled && !attribute.options().isEmpty() && !attribute.options().contains(values.get(attribute.id()))) {
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN,
                        attribute.name() + " 的取值不在值域内: " + values.get(attribute.id()));
            }
            if (filled) {
                checkValueShape(attribute, values.get(attribute.id()));
            }
        }
        // 反方向：填了不属于这个类目的属性
        Set<UUID> allowed = config.attributes().stream()
                .map(CategoryConfig.AttributeView::id)
                .collect(Collectors.toSet());
        for (UUID attributeId : values.keySet()) {
            if (!allowed.contains(attributeId)) {
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "这个属性不属于该类目: " + attributeId);
            }
        }
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
     * SKU 的规格维度必须都是类目标了 {@code is_sales_spec} 的属性，且取值必须在值域内。
     *
     * <p>「一个属性能不能当规格，是类目定的，不是商家自由发挥」——否则同一个类目里
     * 有人用「颜色」有人用「色系」，搜索和筛选全废。这条之前也没有。
     *
     * <p><b>值域校验同样重要。</b> 类目给「存储」定了 {@code 128G / 256G}，如果 SKU 能传
     * {@code 512G}，那值域就只是一句建议：搜「128G」搜不到这个商品（它的 spec_values 是 512G），
     * 而买家看到的规格也是 512G。值域是"这个维度只有这几种"，规格值必须落在里面。
     */
    private void checkSpecAttributes(CategoryConfig config, List<CreateProductRequest.SkuRequest> skus) {
        Map<UUID, CategoryConfig.AttributeView> specAttributes = config.attributes().stream()
                .filter(CategoryConfig.AttributeView::salesSpec)
                .collect(Collectors.toMap(CategoryConfig.AttributeView::id, attribute -> attribute));
        for (CreateProductRequest.SkuRequest sku : skus) {
            for (Map.Entry<UUID, String> spec : sku.specs().entrySet()) {
                CategoryConfig.AttributeView attribute = specAttributes.get(spec.getKey());
                if (attribute == null) {
                    throw BusinessException.badRequest(
                            ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN,
                            "这个属性不能当规格（类目没有标 is_sales_spec）: " + spec.getKey());
                }
                if (!attribute.options().isEmpty() && !attribute.options().contains(spec.getValue())) {
                    throw BusinessException.badRequest(
                            ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN,
                            attribute.name() + " 的取值不在值域内: " + spec.getValue() + "，可选 "
                                    + String.join(" / ", attribute.options()));
                }
            }
        }
    }

    /**
     * 售卖资格。
     *
     * @param config 类目配置。{@code qualification_codes} 必须传进去——资质要求是 catalog 的配置，
     *     trust 不该反向读它（那会成环），所以由这边取出来交给它判
     */
    private void checkTrust(UUID merchantId, UUID categoryId, UUID brandId, CategoryConfig config) {
        SellDecision decision = trust.canSell(merchantId, categoryId, brandId, config.qualificationCodes());
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
