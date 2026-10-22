package com.shop.platform.catalog.service;

import com.shop.platform.audit.model.AuditEntry;
import com.shop.platform.audit.model.FieldChange;
import com.shop.platform.audit.service.AuditRecorder;
import com.shop.platform.catalog.dto.CreateProductRequest;
import com.shop.platform.catalog.dto.OfferResult;
import com.shop.platform.catalog.dto.ProductDetail;
import com.shop.platform.catalog.events.OfferPublished;
import com.shop.platform.catalog.mapper.CategoryConfigStore;
import com.shop.platform.catalog.mapper.CategoryStore;
import com.shop.platform.catalog.mapper.OfferStore;
import com.shop.platform.catalog.mapper.ProductStore;
import com.shop.platform.catalog.model.BrandPolicy;
import com.shop.platform.catalog.model.CategoryConfig;
import com.shop.platform.catalog.model.Offer;
import com.shop.platform.catalog.model.OfferStatus;
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
import org.springframework.dao.DuplicateKeyException;
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
    private final ProductStore products;
    private final OfferStore offers;
    private final TrustQuery trust;
    private final AuditRecorder audit;
    private final ApplicationEventPublisher events;

    public CatalogPublishService(
            CategoryStore categories,
            CategoryConfigStore configs,
            ProductStore products,
            OfferStore offers,
            TrustQuery trust,
            AuditRecorder audit,
            ApplicationEventPublisher events) {
        this.categories = Objects.requireNonNull(categories, "categories");
        this.configs = Objects.requireNonNull(configs, "configs");
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
        checkTrust(merchantId, category.id(), request.brandId());
        checkRequiredAttributes(config, request.attributes());
        checkSpecAttributes(config, request.skus());

        Set<String> specKeys = new HashSet<>();
        for (CreateProductRequest.SkuRequest sku : request.skus()) {
            String key = ProductStore.specKey(sku.specs());
            if (!specKeys.add(key)) {
                throw BusinessException.conflict(ErrorCodes.DUPLICATE_SKU_SPEC, "同一 SPU 下规格组合重复: " + key);
            }
        }

        UUID spuId = Ids.newId();
        products.insertSpu(
                spuId,
                merchantId,
                category.id(),
                request.brandId(),
                request.title(),
                request.modelNo(),
                request.images());

        for (CreateProductRequest.SkuRequest sku : request.skus()) {
            products.insertSku(Ids.newId(), spuId, sku.specs(), sku.price(), sku.weightG());
        }
        if (request.attributes() != null) {
            for (CreateProductRequest.AttributeRequest attribute : request.attributes()) {
                products.insertAttribute(spuId, attribute.attributeId(), attribute.value());
            }
        }
        return spuId;
    }

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
        checkTrust(merchantId, category.id(), spu.brandId());

        Offer pending = Offer.draft(spuId, merchantId, shopId).transitionTo(OfferStatus.PENDING);
        try {
            offers.insert(pending);
        } catch (DuplicateKeyException e) {
            throw BusinessException.conflict("OFFER_ALREADY_EXISTS", "这个商品已经在该店铺挂售");
        }

        if (!config.autoApprove()) {
            return new OfferResult(pending.id(), pending.status());
        }

        Offer approved = pending.transitionTo(OfferStatus.APPROVED);
        if (!offers.transition(pending, OfferStatus.APPROVED, null, null)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
        }
        Offer online = approved.transitionTo(OfferStatus.ONLINE);
        if (!offers.transition(approved, OfferStatus.ONLINE, null, null)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
        }
        offers.review(pending.id(), 1, "approved", "auto_approve", null);
        products.updateSpuStatus(spuId, "active");
        audit.record(AuditEntry.bySystem(
                "catalog.offer.approved",
                "offer",
                pending.id().toString(),
                Map.of("status", FieldChange.of("pending", "online"))));
        publish(online);
        return new OfferResult(online.id(), online.status());
    }

    /** 人工审核通过。等 staff 登录接上后再加 controller；现在先留服务入口。 */
    @Transactional
    public void approveOffer(UUID offerId, UUID reviewerId) {
        Offer pending = requireOffer(offerId);
        Offer approved = pending.transitionTo(OfferStatus.APPROVED);
        if (!offers.transition(pending, OfferStatus.APPROVED, reviewerId, null)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
        }
        offers.review(offerId, 1, "approved", "manual", reviewerId);
        audit.record(AuditEntry.byStaff(
                "catalog.offer.approved",
                "offer",
                offerId.toString(),
                reviewerId,
                approved.merchantId(),
                Map.of("status", FieldChange.of("pending", "approved"))));
    }

    /** 审核通过后上架。 */
    @Transactional
    public void publishOffer(UUID offerId, UUID reviewerId) {
        Offer approved = requireOffer(offerId);
        Offer online = approved.transitionTo(OfferStatus.ONLINE);
        if (!offers.transition(approved, OfferStatus.ONLINE, reviewerId, null)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
        }
        products.updateSpuStatus(online.spuId(), "active");
        audit.record(AuditEntry.byStaff(
                "catalog.offer.approved",
                "offer",
                offerId.toString(),
                reviewerId,
                online.merchantId(),
                Map.of("status", FieldChange.of("approved", "online"))));
        publish(online);
    }

    /** 人工驳回。 */
    @Transactional
    public void rejectOffer(UUID offerId, UUID reviewerId, String reason) {
        Offer pending = requireOffer(offerId);
        Offer rejected = pending.transitionTo(OfferStatus.REJECTED);
        if (!offers.transition(pending, OfferStatus.REJECTED, reviewerId, reason)) {
            throw BusinessException.conflict("OFFER_STATE_CONFLICT", "offer 刚被别的请求改过");
        }
        offers.review(offerId, 1, "rejected", reason, reviewerId);
        audit.record(AuditEntry.byStaff(
                "catalog.offer.rejected",
                "offer",
                offerId.toString(),
                reviewerId,
                rejected.merchantId(),
                Map.of("status", FieldChange.of("pending", "rejected"))));
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

    private void checkTrust(UUID merchantId, UUID categoryId, UUID brandId) {
        SellDecision decision = trust.canSell(merchantId, categoryId, brandId);
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
