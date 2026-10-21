package com.shop.platform.catalog.service;

import com.shop.platform.audit.model.AuditEntry;
import com.shop.platform.audit.model.FieldChange;
import com.shop.platform.audit.service.AuditRecorder;
import com.shop.platform.catalog.dto.CreateProductRequest;
import com.shop.platform.catalog.dto.OfferResult;
import com.shop.platform.catalog.dto.ProductDetail;
import com.shop.platform.catalog.events.OfferPublished;
import com.shop.platform.catalog.mapper.CategoryStore;
import com.shop.platform.catalog.mapper.OfferStore;
import com.shop.platform.catalog.mapper.ProductStore;
import com.shop.platform.catalog.model.Offer;
import com.shop.platform.catalog.model.OfferStatus;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.trust.api.SellDecision;
import com.shop.platform.trust.api.TrustQuery;
import java.time.Instant;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
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
    private final ProductStore products;
    private final OfferStore offers;
    private final TrustQuery trust;
    private final AuditRecorder audit;
    private final ApplicationEventPublisher events;

    public CatalogPublishService(
            CategoryStore categories,
            ProductStore products,
            OfferStore offers,
            TrustQuery trust,
            AuditRecorder audit,
            ApplicationEventPublisher events) {
        this.categories = Objects.requireNonNull(categories, "categories");
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
        checkBrandPolicy(category.brandPolicy(), request.brandId());
        checkTrust(merchantId, category.id(), request.brandId());

        Set<String> specKeys = new HashSet<>();
        for (CreateProductRequest.SkuRequest sku : request.skus()) {
            String key = ProductStore.specKey(sku.specs());
            if (!specKeys.add(key)) {
                throw BusinessException.conflict("DUPLICATE_SKU_SPEC", "同一 SPU 下规格组合重复: " + key);
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
        checkTrust(merchantId, category.id(), spu.brandId());

        Offer pending = Offer.draft(spuId, merchantId, shopId).transitionTo(OfferStatus.PENDING);
        try {
            offers.insert(pending);
        } catch (DuplicateKeyException e) {
            throw BusinessException.conflict("OFFER_ALREADY_EXISTS", "这个商品已经在该店铺挂售");
        }

        if (!category.autoApprove()) {
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
        if (!"active".equals(category.status())) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_DISABLED, "类目已停用");
        }
        if (!category.leaf()) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_NOT_LEAF, "商品只能挂叶子类目");
        }
        return category;
    }

    private void checkBrandPolicy(String policy, UUID brandId) {
        if ("required".equals(policy) && brandId == null) {
            throw BusinessException.badRequest("BRAND_REQUIRED", "该类目必须选择品牌");
        }
        if ("forbidden".equals(policy) && brandId != null) {
            throw BusinessException.badRequest("BRAND_FORBIDDEN", "该类目不允许选择品牌");
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
