package com.shop.platform.catalog.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.catalog.dto.CreateProductRequest;
import com.shop.platform.catalog.dto.SellerProductDetail;
import com.shop.platform.catalog.dto.UpdateProductRequest;
import com.shop.platform.catalog.mapper.BrandMapper;
import com.shop.platform.catalog.mapper.CategoryConfigMapper;
import com.shop.platform.catalog.mapper.CategoryMapper;
import com.shop.platform.catalog.mapper.CategoryRow;
import com.shop.platform.catalog.mapper.ListingMapper;
import com.shop.platform.catalog.mapper.SellerProductReadMapper;
import com.shop.platform.catalog.mapper.SkuMapper;
import com.shop.platform.catalog.mapper.SpuAttrMapper;
import com.shop.platform.catalog.mapper.SpuMapper;
import com.shop.platform.catalog.mapper.SpuMediaMapper;
import com.shop.platform.catalog.model.BrandPolicy;
import com.shop.platform.catalog.model.CategoryConfig;
import com.shop.platform.catalog.model.ListingStatus;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import com.shop.platform.governance.api.GovernanceQuery;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.inventory.api.InventoryCommand;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 卖家改自己的商品：基本信息、SKU 价格/停售、上下架、删草稿。
 *
 * <p><b>与 {@link CatalogPublishService} 分开两个类，不合并。</b> 那个管「能不能卖出去」
 * （建草稿 → 提交 → 审核 → 上架），这个管「已经存在的东西怎么改」。合并的后果是发布闸门
 * （类目配置、必填属性、品牌策略、治理资格、识别键）和编辑校验混在一个类里，
 * 想只改个标题都得读完整条发布链路。
 *
 * <p>两者共用的是**闸门本身**，所以校验方法留在 {@link CatalogPublishService} 上被这里调用，
 * 而不是复制一份——两处判断迟早会漂。
 *
 * <h2>改完要不要重新审核</h2>
 *
 * <p>判据不是「改了什么字段」，而是**这个商品现在是不是正在卖**：
 *
 * <ul>
 *   <li>草稿 / 被驳回 / 已下架 → 随便改，没人看得见。下次提交时自然过闸
 *   <li>审核中（{@code pending}）→ 拒改。审核员正在看的那一版和商家提交的那一版必须一致，
 *       否则「审核通过的是 A，卖出去的是 B」
 *   <li><b>已上架（{@code online}）→ 自动转 {@code pending}，下线待审</b>
 * </ul>
 *
 * <p>最后一条是关键。不加它，「先上架合规商品、再改成违规商品」就是一条绕过审核的路，
 * 而平台侧完全看不见——商品状态一直显示 online。转 pending 的代价是商家改一个错别字
 * 也要等审核，但这是对的：<b>上架状态本身就是审核过的结论，改动即失效</b>。
 * 免审类目（{@code auto_approve}）不付这个代价，改完直接重新上架。
 */
@Component
public class SellerProductEditService {

    /** 可写的 SKU 状态。用白名单而不是自由字符串：{@code ck_sku_status} 只认这两个，别的会 500。 */
    private static final Set<String> WRITABLE_SKU_STATUS = Set.of("active", "disabled");

    private final SpuMapper products;
    private final SkuMapper skus;
    private final SpuAttrMapper attributes;
    private final SpuMediaMapper medias;
    private final ListingMapper listings;
    private final SellerProductReadMapper reads;
    private final CategoryMapper categories;
    private final CategoryConfigMapper configs;
    private final BrandMapper brands;
    private final IdentityKeyResolver identityKeys;
    private final StandardMatcher standard;
    private final GovernanceQuery governance;
    private final AuditCommand audit;
    private final InventoryCommand inventory;
    private final CatalogPublishService publish;

    public SellerProductEditService(
            SpuMapper products,
            SkuMapper skus,
            SpuAttrMapper attributes,
            SpuMediaMapper medias,
            ListingMapper listings,
            SellerProductReadMapper reads,
            CategoryMapper categories,
            CategoryConfigMapper configs,
            BrandMapper brands,
            IdentityKeyResolver identityKeys,
            StandardMatcher standard,
            GovernanceQuery governance,
            AuditCommand audit,
            InventoryCommand inventory,
            CatalogPublishService publish) {
        this.products = Objects.requireNonNull(products, "products");
        this.skus = Objects.requireNonNull(skus, "skus");
        this.attributes = Objects.requireNonNull(attributes, "attributes");
        this.medias = Objects.requireNonNull(medias, "medias");
        this.listings = Objects.requireNonNull(listings, "listings");
        this.reads = Objects.requireNonNull(reads, "reads");
        this.categories = Objects.requireNonNull(categories, "categories");
        this.configs = Objects.requireNonNull(configs, "configs");
        this.brands = Objects.requireNonNull(brands, "brands");
        this.identityKeys = Objects.requireNonNull(identityKeys, "identityKeys");
        this.standard = Objects.requireNonNull(standard, "standard");
        this.governance = Objects.requireNonNull(governance, "governance");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.inventory = Objects.requireNonNull(inventory, "inventory");
        this.publish = Objects.requireNonNull(publish, "publish");
    }

    /**
     * 卖家详情。<b>任何状态可读</b>——包括草稿、审核中、已下架。
     *
     * <p>归属写进 SQL（{@code merchant_id = ?}），查不到就是 404。
     * 这里不调 {@code checkShop}：商品的归属商家由 SPU 决定，而一个 SPU 可能挂在多个店铺，
     * 按店铺判会把「这个 SPU 属于我」误判成「这个店铺不属于我」。
     */
    @Transactional(readOnly = true)
    public SellerProductDetail detail(UUID spuId, CurrentOperator operator) {
        UUID merchantId = requireSeller(operator);
        return reads.findForMerchant(spuId, merchantId)
                .map(SellerProductReadMapper.DetailRow::toDetail)
                .orElseThrow(() -> BusinessException.notFound("商品不存在: " + spuId));
    }

    /**
     * 改基本信息：标题、品牌、型号、属性、图。
     *
     * <p>校验复用发布链路的闸门（{@link CatalogPublishService} 的四个 check），
     * 因为它们判的是同一件事：<b>这个商品能不能合法地出现在这个类目下</b>。
     * 编辑时跳过闸门等于「建的时候合规、改的时候可以不合规」。
     *
     * <p><b>属性是全量替换，不是增量。</b> 请求里给的是「改完之后是什么」，不是「要改哪几条」——
     * 增量语义下删不掉属性（只能删有值的那些），而「把这个属性清空」正是编辑最常见的动作。
     *
     * <p>品牌/型号变了要重算识别键并重新挂标准品，否则商品叫 A、标准品挂在 B 上，比价全错。
     */
    @Transactional
    public SellerProductDetail updateBasics(UUID spuId, UpdateProductRequest request, CurrentOperator operator) {
        UUID merchantId = requireSeller(operator);
        SpuMapper.EditableSpu current = requireEditable(spuId, merchantId);
        CategoryRow category = publish.requireCategory(current.categoryId());
        CategoryConfig config = publish.requireConfig(category.id());

        publish.checkBrandPolicy(BrandPolicy.from(config.brandPolicy()), request.brandId());
        publish.checkGovernance(merchantId, category.id(), request.brandId(), config);
        // 有 listing（含被驳回/已下架）就说明这条内容曾经进过审核链路；草稿不拦，商家得能先写。
        if (!listings.findRefsBySpu(spuId).isEmpty()) {
            publish.checkForbiddenWords(request.title(), request.subtitle());
        }
        Map<UUID, List<String>> attributeValues = CatalogPublishService.updateAttributeValues(request.attributes());
        publish.checkRequiredAttributes(config, attributeValues);

        IdentityKeyResolver.ResolvedIdentity identity =
                identityKeys.resolveSpu(config, request.modelNo(), brandName(request.brandId()), attributeValues);

        int updated = products.updateBasics(
                spuId,
                merchantId,
                request.title(),
                request.subtitle(),
                request.sevenDayReturn(),
                request.brandId(),
                request.modelNo(),
                identity.kind(),
                identity.matchKey());
        if (updated == 0) {
            // 读的时候还在、写的时候没了：要么被并发删了，要么归属变了。0 行是判决，不是异常
            throw BusinessException.conflict("SPU_STATE_CONFLICT", "商品刚被别的请求改过");
        }

        replaceAttributes(spuId, config, attributeValues);
        replaceImages(spuId, request.images());
        medias.deleteDetailOfSpu(spuId);
        medias.insertDetailImages(spuId, request.detailImages());
        publish.insertSpecImages(spuId, config, request.specImages());
        // 识别键可能变了，标准品要重新挂。
        //
        // **先清空再挂，不能只调 match。** `StandardMatcher.match` 在 identityKind = NONE
        // （或 matchKey 为 null）时直接 return，不写 standard_spu_id = NULL——于是改了品牌/型号
        // 之后认不出新键的商品，会继续挂在**旧识别键的标准品**上，而 ck_spu_matched 只校验
        // standard_matched_by 的枚举值，拦不住这个。后果是这个商品出现在一个已经和它无关的
        // 比价列表里，而两边都看不出错在哪。
        products.clearStandard(spuId);
        standard.match(
                spuId,
                category.id(),
                request.brandId(),
                request.modelNo(),
                request.title(),
                identity.kind(),
                identity.matchKey());

        Map<String, FieldChange> changes = new LinkedHashMap<>();
        if (!Objects.equals(current.title(), request.title())) {
            changes.put("title", FieldChange.of(current.title(), request.title()));
        }
        if (!Objects.equals(current.subtitle(), request.subtitle())) {
            changes.put(
                    "subtitle",
                    FieldChange.of(
                            current.subtitle() == null ? "" : current.subtitle(),
                            request.subtitle() == null ? "" : request.subtitle()));
        }
        if (!Objects.equals(current.brandId(), request.brandId())) {
            changes.put("brandId", FieldChange.of(current.brandId(), request.brandId()));
        }
        audit.record(AuditEntry.byMerchant(
                "catalog.product.updated",
                "spu",
                spuId.toString(),
                merchantId,
                changes.isEmpty() ? Map.of("attributes", FieldChange.to("replaced")) : changes));

        reReviewIfNeeded(spuId, operator, "编辑基本信息");
        return detail(spuId, operator);
    }

    /**
     * 改 SKU：价格、重量、停售。<b>不改规格</b>（见 {@code UpdateProductRequest.SkuRequest}）。
     *
     * <p><b>全量替换语义：请求里没给的 SKU 一律停售。</b> 这与「改价」的直觉相反，
     * 但它是唯一安全的读法——增量语义下，商家删掉一个规格后前端不再传它，那条 SKU 会永远活着，
     * 继续出现在可售点查里（{@code findSellable} 只认 {@code status = 'active'}），
     * 买家能买到商家以为已经删掉的规格。
     *
     * <p>代价是前端必须每次把全部 SKU 传上来。这对卖家后台是自然形态——它就是一张全量的规格表格。
     */
    @Transactional
    public SellerProductDetail updateSkus(
            UUID spuId, List<UpdateProductRequest.SkuRequest> request, CurrentOperator operator) {
        UUID merchantId = requireSeller(operator);
        SpuMapper.EditableSpu current = requireEditable(spuId, merchantId);
        // frozen 类目允许改存量（卖完为止），closed 不再允许任何编辑
        publish.requireCategory(current.categoryId());

        Set<UUID> owned = new HashSet<>(skus.skuIds(spuId));
        Set<UUID> seen = new HashSet<>();
        Set<String> merchantCodes = new HashSet<>();
        for (UpdateProductRequest.SkuRequest sku : request) {
            if (!owned.contains(sku.skuId())) {
                // 按 (spuId, skuId) 双键更新本来就会 0 行，但那报出来的是「刚被改过」，
                // 而真实原因是「这个 sku 不是这个 spu 的」。分开判，报错才说得清
                throw BusinessException.notFound("SKU 不属于这个商品: " + sku.skuId());
            }
            if (!seen.add(sku.skuId())) {
                throw BusinessException.badRequest(ErrorCodes.DUPLICATE_SKU_SPEC, "同一个 SKU 出现了两次: " + sku.skuId());
            }
            if (sku.status() != null && !WRITABLE_SKU_STATUS.contains(sku.status())) {
                throw BusinessException.badRequest("SKU 状态只能是 active / disabled: " + sku.status());
            }
            validateSkuInput(sku.price(), sku.weightG(), sku.originalPrice());
            publish.validateMerchantCode(merchantId, sku.merchantCode(), sku.skuId(), merchantCodes);
            int updated = skus.updateSku(
                    spuId,
                    sku.skuId(),
                    sku.price().amount(),
                    sku.price().currency(),
                    sku.weightG(),
                    sku.originalPrice() == null ? null : sku.originalPrice().amount(),
                    sku.merchantCode(),
                    // null = 保持当前状态。编辑表单里一条已停售的 SKU 不该因为没带 status 就重新上架
                    sku.status());
            if (updated == 0) {
                throw BusinessException.conflict("SKU_STATE_CONFLICT", "SKU 刚被别的请求改过: " + sku.skuId());
            }
        }

        // 没在请求里出现的 SKU 停售：见方法注释。它不删行——order_line 还指着这些 id
        List<UUID> toDisable = owned.stream().filter(id -> !seen.contains(id)).toList();
        for (UUID skuId : toDisable) {
            // 只改状态：顺手写 price_amount = 0 会让这条规格丢掉价格，下次带回表单就是 ¥0 在售
            skus.disable(spuId, skuId);
        }
        if (skus.countActive(spuId) == 0) {
            throw BusinessException.badRequest("SKU_REQUIRED", "至少要保留一个 SKU，否则商品无法售卖");
        }

        audit.record(AuditEntry.byMerchant(
                "catalog.product.skus_updated",
                "spu",
                spuId.toString(),
                merchantId,
                Map.of(
                        "updated", FieldChange.to(seen.size()),
                        "disabled", FieldChange.to(toDisable.size()))));

        reReviewIfNeeded(spuId, operator, "改 SKU");
        return detail(spuId, operator);
    }

    /**
     * 新增 SKU。
     *
     * <p>SKU 生命周期之前只有「改价 / 停售」，没有「新增」——商家想加一个颜色，
     * 唯一的办法是删掉整个商品重建。规格仍然不可改：改规格等于把这条 SKU 变成另一个商品，
     * 而历史订单里的 {@code sku_id} 还指着它。要换规格就停售旧的、在这里加新的。
     *
     * <p>新 SKU 的规格维度必须和现有 SKU 一致：缺一个组合靠少一行 SKU 表达，
     * 不是靠这条 SKU 少一个维度。
     */
    @Transactional
    public SellerProductDetail addSkus(
            UUID spuId, List<CreateProductRequest.SkuRequest> request, CurrentOperator operator) {
        if (request == null || request.isEmpty()) {
            throw BusinessException.badRequest("SKU_REQUIRED", "至少给一条 SKU");
        }
        UUID merchantId = requireSeller(operator);
        SpuMapper.EditableSpu current = requireEditable(spuId, merchantId);
        publish.requireCategory(current.categoryId());
        CategoryConfig config = publish.requireConfig(current.categoryId());

        List<CatalogPublishService.SkuSpecInput> inputs = request.stream()
                .map(sku -> new CatalogPublishService.SkuSpecInput(sku.specs(), sku.barcode()))
                .toList();
        publish.checkSpecAttributes(config, inputs);
        publish.checkBarcodes(config, inputs);

        List<SkuMapper.SpecRow> existing = skus.findSpecRows(spuId);
        if (!existing.isEmpty()) {
            Set<UUID> dimensions = CatalogPublishService.readSpecs(
                            existing.getFirst().specValuesJson())
                    .keySet();
            for (CatalogPublishService.SkuSpecInput input : inputs) {
                Set<UUID> inputDimensions =
                        input.specs() == null ? Set.of() : input.specs().keySet();
                if (!dimensions.equals(inputDimensions)) {
                    throw BusinessException.badRequest(
                            ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "新增 SKU 的规格维度必须与现有 SKU 一致");
                }
            }
        }

        Set<String> specKeys = new HashSet<>(skus.specKeys(spuId));
        for (CreateProductRequest.SkuRequest sku : request) {
            String key = SpuMapper.specKey(sku.specs());
            if (!specKeys.add(key)) {
                throw BusinessException.conflict(ErrorCodes.DUPLICATE_SKU_SPEC, "同一 SPU 下规格组合重复: " + key);
            }
        }

        Set<String> merchantCodes = new HashSet<>();
        for (CreateProductRequest.SkuRequest sku : request) {
            validateSkuInput(sku.price(), sku.weightG(), sku.originalPrice());
            publish.validateMerchantCode(merchantId, sku.merchantCode(), null, merchantCodes);
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

        audit.record(AuditEntry.byMerchant(
                "catalog.product.skus_updated",
                "spu",
                spuId.toString(),
                merchantId,
                Map.of("added", FieldChange.to(request.size()))));

        reReviewIfNeeded(spuId, operator, "新增 SKU");
        return detail(spuId, operator);
    }

    /**
     * 商家自己下架。
     *
     * <p><b>只有 online 能下。</b> pending 的还没上过架，谈不上下架（那是撤回，走驳回）；
     * 已经 offline 的再下一次是幂等噪音，拒掉让前端知道状态不对。
     *
     * <p><b>下架不发 {@code ListingOffline} 事件？</b> 发。搜索索引靠它清，不发就会
     * 「后台显示已下架、搜索里还能搜到、点进去 404」——{@code product-model.md} §5 失败模式第一条。
     * 所以这里复用 {@link CatalogPublishService#offlineOffer}，不自己写一遍。
     */
    @Transactional
    public SellerProductDetail offline(UUID spuId, String reason, CurrentOperator operator) {
        UUID merchantId = requireSeller(operator);
        requireEditable(spuId, merchantId);
        List<ListingMapper.ListingRef> online = listings.findRefsBySpu(spuId).stream()
                .filter(ref -> ListingStatus.from(ref.status()) == ListingStatus.ONLINE)
                .toList();
        if (online.isEmpty()) {
            throw BusinessException.conflict("LISTING_STATE_INVALID", "这个商品没有已上架的 listing 可下架");
        }
        for (ListingMapper.ListingRef ref : online) {
            publish.offlineOffer(ref.id(), operator.operatorId(), reason == null ? "商家主动下架" : reason, true);
        }
        return detail(spuId, operator);
    }

    /**
     * 商家重新上架。<b>必须重新过发布闸门，且必须重走审核。</b>
     *
     * <p>「下架不能直接回 online」是文档定的不变式（{@code product-model.md} §3 状态机）：
     * 否则下架就成了绕过审核的开关——先上架合规商品，下架、改违规、再上架。
     *
     * <p>所以这个入口做的是「回 pending」而不是「回 online」。免审类目下
     * {@link CatalogPublishService#submitListing} 会继续把它推到 online，商家感觉不到差别。
     *
     * <p>闸门在这里重跑一遍：下架期间类目可能被停用、授权可能过期、品牌可能被撤。
     * 不重跑的后果是「一个已经没有资格卖的商品，点一下重新上架就又开始卖了」。
     */
    @Transactional
    public SellerProductDetail relist(UUID spuId, CurrentOperator operator) {
        UUID merchantId = requireSeller(operator);
        requireEditable(spuId, merchantId);
        List<ListingMapper.ListingRef> relistable = listings.findRefsBySpu(spuId).stream()
                .filter(ref -> {
                    ListingStatus status = ListingStatus.from(ref.status());
                    return status == ListingStatus.OFFLINE || status == ListingStatus.REJECTED;
                })
                .toList();
        if (relistable.isEmpty()) {
            throw BusinessException.conflict("LISTING_STATE_INVALID", "这个商品没有可重新提交的 listing");
        }
        for (ListingMapper.ListingRef ref : relistable) {
            publish.submitListingInternal(spuId, ref.shopId(), operator);
        }
        return detail(spuId, operator);
    }

    /**
     * 删草稿。<b>只删得掉从来没提交过挂售的 SPU。</b>
     *
     * <p>一旦提交过（哪怕后来被驳回），它就是审核历史的一部分，不能删——
     * 驳回理由、轮次都在 {@code listing_review} 里，删了 SPU 会让这些行悬空，
     * 而商家侧看到的是「我明明提交过，怎么什么都没有了」。
     *
     * <p>提交过但想放弃的，正确做法是停售全部 SKU（商品卖不出去、但历史留痕），
     * 或者让平台下架。这不是一个「删除」按钮能表达的语义。
     *
     * <p>删的顺序：先删子表（{@code spu_attr} / {@code spu_media} / {@code sku}），再删 SPU。
     * 本库不建外键，所以数据库不会替你挡——但 {@code order_line.sku_id} 会变成悬空引用，
     * 所以删之前还要确认没有任何订单引用过这些 SKU（理论上没提交过挂售就不可能有订单，
     * 但那依赖另一个模块的不变式，不该在这里假设）。
     */
    @Transactional
    public void deleteDraft(UUID spuId, CurrentOperator operator) {
        UUID merchantId = requireSeller(operator);
        SpuMapper.EditableSpu current = requireEditable(spuId, merchantId);
        if (current.listingId() != null) {
            throw BusinessException.conflict("SPU_HAS_LISTING", "这个商品提交过挂售（含被驳回），不能删除；要放弃请把 SKU 全部停售");
        }
        for (UUID skuId : skus.skuIds(spuId)) {
            if (skus.isReferencedByOrder(skuId)) {
                throw BusinessException.conflict("SPU_REFERENCED_BY_ORDER", "这个商品的 SKU 已有订单引用，不能删除");
            }
            // 草稿也能改库存（/stock 不要求 listing），删 SKU 前把库存行一起清掉，
            // 否则 inventory.stock 会留下永远没人再读的孤儿行
            inventory.forgetSku(skuId);
        }
        attributes.deleteAllOfSpu(spuId);
        medias.deleteAllOfSpu(spuId);
        skus.deleteAllOfSpu(spuId);
        if (products.deleteDraft(spuId, merchantId) == 0) {
            // 读的时候还没有 listing，写的时候有了——并发提交。0 行是判决
            throw BusinessException.conflict("SPU_STATE_CONFLICT", "商品刚被提交挂售，不能删除");
        }
        audit.record(AuditEntry.byMerchant(
                "catalog.product.deleted",
                "spu",
                spuId.toString(),
                merchantId,
                Map.of("title", FieldChange.from(current.title()))));
    }

    /**
     * 改完是否要重新审核。<b>这是整个类最需要想清楚的一段。</b>
     *
     * <p>三种情况：
     *
     * <ul>
     *   <li>没有 listing，或状态是 draft / rejected / offline → 什么都不做。没人看得见，下次提交时自然过闸
     *   <li>pending → 拒改。审核员正在看的那一版和商家提交的那一版必须一致
     *   <li>online → 转 pending 下线待审；免审类目直接重新上架
     * </ul>
     *
     * <p>为什么 online 要转 pending：不加它，「先上架合规商品、再改成违规商品」就是一条
     * 绕过审核的路，而平台侧完全看不见——商品状态一直显示 online。
     *
     * <p>为什么不是「只在下架再改」：那等于要求商家为了改一个错别字先下架商品，
     * 期间所有人买不到。转 pending 也会让商品下线，但它是一次操作、且有审核记录可追。
     */
    private void reReviewIfNeeded(UUID spuId, CurrentOperator operator, String what) {
        List<ListingMapper.ListingRef> refs = listings.findRefsBySpu(spuId);
        if (refs.isEmpty()) {
            return;
        }
        boolean pending = refs.stream().anyMatch(ref -> ListingStatus.from(ref.status()) == ListingStatus.PENDING);
        if (pending) {
            throw BusinessException.conflict("LISTING_IN_REVIEW", "商品正在审核中，不能修改；等审核结果出来再改");
        }
        List<ListingMapper.ListingRef> online = refs.stream()
                .filter(ref -> ListingStatus.from(ref.status()) == ListingStatus.ONLINE)
                .toList();
        if (online.isEmpty()) {
            return;
        }
        // 先全部下架，再逐店重提：标题/属性/图都是 SPU 级的，改一次会影响所有店铺的 listing，
        // 只处理最新一条会让其他店继续卖未审核的新内容。
        for (ListingMapper.ListingRef ref : online) {
            publish.offlineOffer(ref.id(), operator.operatorId(), "编辑触发重新审核：" + what, true);
        }
        for (ListingMapper.ListingRef ref : online) {
            publish.submitListingInternal(spuId, ref.shopId(), operator);
        }
    }

    /**
     * 属性全量替换。
     *
     * <p>先删后插而不是逐条 UPDATE：{@code uq_spu_attr (spu_id, attribute_id, value_index)} 下
     * 「把 A 属性的值挪给 B 属性」在增量语义里会撞唯一键，而全量替换不会。
     *
     * <p>多值属性按 {@code value_index} 递增写；三个值列按 {@code value_type} 分派，
     * 见 {@link SpuAttrMapper} 的类注释。
     */
    private void replaceAttributes(UUID spuId, CategoryConfig config, Map<UUID, List<String>> values) {
        attributes.deleteAllOfSpu(spuId);
        publish.insertAttributes(spuId, config, values);
    }

    /**
     * 图全量替换。
     *
     * <p><b>只换通用图，不动规格图。</b> 规格图（{@code attribute_id IS NOT NULL}）挂在规格值上，
     * 选「红」就换图——那是 SKU 维度的事实，不该被「改基本信息」清掉。
     */
    private void replaceImages(UUID spuId, List<String> images) {
        medias.deleteGenericOfSpu(spuId);
        medias.insertGenericImages(spuId, images);
    }

    private SpuMapper.EditableSpu requireEditable(UUID spuId, UUID merchantId) {
        return products.findEditable(spuId)
                .filter(row -> row.merchantId().equals(merchantId))
                .orElseThrow(() -> BusinessException.notFound("商品不存在: " + spuId));
    }

    /**
     * 请求体是裸数组，Spring 的 {@code @Valid} 不一定级联到元素上——这里补一层，
     * 免得空价格 NPE、负重量撞库约束变成 500。
     */
    private static void validateSkuInput(Money price, Integer weightG, Money originalPrice) {
        if (price == null) {
            throw BusinessException.badRequest("SKU 价格必填");
        }
        if (!"CNY".equals(price.currency())) {
            throw BusinessException.badRequest("SKU 价格只支持 CNY: " + price.currency());
        }
        if (weightG != null && weightG <= 0) {
            throw BusinessException.badRequest("SKU 重量必须大于 0: " + weightG);
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

    private String brandName(UUID brandId) {
        if (brandId == null) {
            return "";
        }
        return brands.findApprovedName(brandId)
                .orElseThrow(
                        () -> BusinessException.badRequest(ErrorCodes.BRAND_NOT_AVAILABLE, "品牌不存在或未通过审核: " + brandId));
    }

    private UUID requireSeller(CurrentOperator operator) {
        if (!CurrentOperator.TYPE_SELLER.equals(operator.operatorType()) || operator.merchantId() == null) {
            throw BusinessException.forbidden("SELLER_ONLY", "只有卖家可以操作商品");
        }
        return operator.merchantId();
    }
}
