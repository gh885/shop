package com.shop.platform.product.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.common.Validate;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.order.api.ProductSoldReadQuery;
import com.shop.platform.product.dto.ProductQuery;
import com.shop.platform.product.dto.SkuUpdateItem;
import com.shop.platform.product.mapper.CategoryAttr;
import com.shop.platform.product.mapper.CategoryAttrMapper;
import com.shop.platform.product.mapper.CategoryAttrValue;
import com.shop.platform.product.mapper.CategoryAttrValueMapper;
import com.shop.platform.product.mapper.CategoryMapper;
import com.shop.platform.product.mapper.ParamItem;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SkuAttr;
import com.shop.platform.product.mapper.SkuMapper;
import com.shop.platform.product.mapper.SpecItem;
import com.shop.platform.product.mapper.SpecValue;
import com.shop.platform.product.model.AttrKind;
import com.shop.platform.product.model.CategoryAttrStatus;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.model.SkuStatus;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/** 商品 SPU 服务：创建（草稿）→ 规格 → SKU → 发布，逐步补充。 */
@Service
@RequiredArgsConstructor
public class ProductService {

    /** 单商品 SKU 组合数上限（笛卡尔积总量校验，见 updateSpecs） */
    private static final int MAX_SKU_COMBINATIONS = 500;

    private final ProductMapper productMapper;
    private final CategoryMapper categoryMapper;
    private final SkuMapper skuMapper;
    private final CategoryAttrMapper attrMapper;
    private final CategoryAttrValueMapper attrValueMapper;
    private final CategoryAttrService categoryAttrService;
    private final StockCommand stockCommand;
    private final StockReadQuery stockReadQuery;
    private final ProductSoldReadQuery productSoldReadQuery;

    /** 创建商品草稿：只落基本信息，specs/SKU 由后续接口补充。shopId 由 controller 从店铺上下文（X-Shop-Id）注入 */
    public Product create(CreateProductCommand command) {
        Validate.isTrue(categoryMapper.selectById(command.categoryId()) != null, "分类不存在");
        // 类目有参数模板时校验 params（required 必填、attrId 归属、值域约束）；无模板维持自由文本
        validateParams(command.categoryId(), command.params());
        Product draft = toDraftEntity(command);
        productMapper.insert(draft);
        return draft;
    }

    /**
     * 按类目属性模板提交规格选择，并按 valueId 组合（spec_key）对账 SKU：
     * 组合没变的保留（价格库存不丢）、组合消失的删除、组合新增的按笛卡尔积生成。
     *
     * <p>规格值 ID 化后，规格值改名只是改快照（见 CategoryAttrService.updateValue），不再被视为新组合—— 消除了旧版"改名即丢价"的已知限制。spec_key = valueId
     * 按模板维度顺序 ':' join，uk_skus_product_spec_key 唯一索引兜底重复组合。
     */
    @Transactional
    public List<Sku> updateSpecs(UUID productId, List<SpecSelection> selections) {
        // 1. 归属 + 规格可编辑性守卫（上架冻结规格，要改先下架）
        Product product = requireShopOwned(productId);
        product.ensureSpecsEditable();
        long distinctAttrs =
                selections.stream().map(SpecSelection::attrId).distinct().count();
        Validate.isTrue(distinctAttrs == selections.size(), "规格属性不能重复");

        // 2. 按模板解析选择：attr 存在、启用、属于商品当前类目、kind=spec；valueIds 属于该 attr；
        //    customValues 仅当 attr.allow_custom 时受理，值域外新值自动建档（source=2，同名复用）
        List<SpecItem> specs = resolveSelections(product, selections);

        // 3. 落规格模板快照（name/value 从模板读出；模板改名后的快照同步在下一次 updateSpecs 重写）
        product.setSpecs(specs);
        productMapper.updateById(product);

        // 4. 算目标组合：按模板顺序对取值做笛卡尔积。总量封顶，防止误操作/恶意请求生成海量 SKU 拖垮库
        List<List<SpecValue>> combos = cartesian(specs);
        Validate.isTrue(combos.size() <= MAX_SKU_COMBINATIONS, "规格组合数过多（" + combos.size() + "），请精简规格后重试");

        // 5. 对账改按 spec_key：组合没变的保留（改名不再产生新组合，价格库存不丢），保留的顺带刷新 attributes/name 快照
        Map<String, Sku> bySpecKey = new LinkedHashMap<>();
        for (Sku sku : skuMapper.selectByProductId(productId)) {
            bySpecKey.put(sku.getSpecKey(), sku);
        }

        List<Sku> result = new ArrayList<>();
        for (List<SpecValue> combo : combos) {
            String specKey = combo.stream().map(sv -> sv.valueId().toString()).collect(Collectors.joining(":"));
            List<SkuAttr> attrs = buildAttributes(specs, combo);
            Sku kept = bySpecKey.remove(specKey);
            if (kept != null) {
                kept.setAttributes(attrs);
                kept.setName(buildSkuName(product, combo));
                skuMapper.updateById(kept);
                result.add(kept);
            } else {
                Sku fresh = Sku.builder()
                        .productId(productId)
                        .attributes(attrs)
                        .specKey(specKey)
                        .name(buildSkuName(product, combo))
                        .status(SkuStatus.ON_SALE)
                        .build();
                skuMapper.insert(fresh);
                // 库存主体行随 SKU 诞生（stock=0），卖家随后经 updateSkus 设总量
                stockCommand.ensureRow(fresh.getId());
                result.add(fresh);
            }
        }

        // 6. 组合消失的旧 SKU 删掉（库存主体行经 inventory :: api 同事务随行清理，流水账本保留）
        for (Sku removed : bySpecKey.values()) {
            stockCommand.removeRow(removed.getId());
            skuMapper.deleteById(removed.getId());
        }

        // 7. 重算价格区间：SPU 与 SKU 都在手上，直接回填免重查
        applyPriceRange(product, result);
        productMapper.updateById(product);
        return result;
    }

    /** 批量更新 SKU。任何状态都允许：上架后补货/改价/停用是日常运营操作。price 必填，其余只 set 非空字段。
     *  库存归 inventory 模块：seller 传的 stock 是「绝对量设定」，经 inventory :: StockCommand.setTotal 走乐观锁，不写 product 表。*/
    @Transactional
    public List<Sku> updateSkus(UUID productId, List<SkuUpdateItem> items) {
        // 1. 商品必须存在且属于当前店铺（任何状态都允许改价/补货，是日常运营操作）；实体留作价格区间回填
        Product product = requireShopOwned(productId);

        // 2. 逐条更新：WHERE 同时校验 SKU 归属，只 set 非空字段（skuCode/status 传 null 即不改）
        try {
            for (SkuUpdateItem item : items) {
                int affected = skuMapper.update(
                        null,
                        new LambdaUpdateWrapper<Sku>()
                                .eq(Sku::getId, item.skuId())
                                .eq(Sku::getProductId, productId)
                                .set(item.name() != null, Sku::getName, item.name())
                                .set(item.image() != null, Sku::getImage, item.image())
                                .set(item.originalPrice() != null, Sku::getOriginalPrice, item.originalPrice())
                                .set(item.skuCode() != null, Sku::getSkuCode, item.skuCode())
                                .set(item.status() != null, Sku::getStatus, item.status())
                                .set(Sku::getPrice, item.price()));
                Validate.isTrue(affected == 1, "SKU 不存在或不属于该商品");
                // 3. 库存绝对量设定（读-改-写，乐观锁）：同一事务内同步调用 inventory :: api
                stockCommand.setTotal(item.skuId(), item.stock());
            }
        } catch (DuplicateKeyException e) {
            // uk_skus_code 全局唯一索引兜底重复业务编码
            throw BusinessException.conflict(null, "SKU 编码已存在");
        }

        // 4. 重算价格区间并返回该商品全部 SKU：一次查出，出参与区间同源
        List<Sku> all = skuMapper.selectByProductId(productId);
        applyPriceRange(product, all);
        productMapper.updateById(product);
        return all;
    }

    /** 发布：门槛是每个 SKU 都已设价（库存允许 0，可售罄上架），通过后置目标态并回填聚合价格区间。
     *  目标态 = 立即上架（PUBLISHED）或放入仓库（WAREHOUSE），由入参 target 决定；两者同门槛。 */
    @Transactional
    public Product publish(UUID productId, ProductStatus target) {
        Product product = requireShopOwned(productId);
        // 0. 草稿阶段允许空名，但发布（无论上架还是入库）必须有名（买家搜索/展示依赖）
        Validate.isTrue(StringUtils.hasText(product.getName()), "请先填写商品标题再发布");
        // 1. 复检发布门槛：每个在售 SKU 都已设价（跨聚合校验留 service）
        applyPriceRange(product, ensurePublishable(productId));
        // 2. 守卫 + 置目标态（仅草稿可发布、目标只许上架/仓库的规则在实体内）
        product.publishTo(target);
        // 3. 状态迁移条件更新（乐观锁）：只允许「DRAFT → target」，丢更新/竞态下 affected=0 抛 409，
        //    避免读-改-写的并发覆盖（如两请求同时发布、或发布外被它请求改态）。
        requireTransition(productId, ProductStatus.DRAFT, target, "商品状态已变化，请刷新后重试");
        // 4. 回填的价格区间需落库（DB status 已被 requireTransition 置 target；这里补写 min/max 等）
        productMapper.updateById(product);
        return product;
    }

    /** 商家后台商品列表：按店铺分页，可按状态/名称筛选，创建时间倒序。管理端要看全量状态，含草稿/下架 */
    public PageResult<Product> pageList(UUID shopId, ProductStatus status, String keyword, long page, long size) {
        // MP 的条件 boolean 参数不短路右侧表达式：keyword.trim() 必须先判空提取，否则无 keyword 请求 NPE
        String trimmedKeyword = keyword == null ? null : keyword.trim();
        Page<Product> result = productMapper.selectPage(
                new Page<>(page, size),
                new LambdaQueryWrapper<Product>()
                        .eq(Product::getShopId, shopId)
                        .eq(status != null, Product::getStatus, status)
                        .like(StringUtils.hasText(trimmedKeyword), Product::getName, trimmedKeyword)
                        .orderByDesc(Product::getCreatedAt)
                        .orderByDesc(Product::getId));
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    /**
     * 卖家工作台商品列表：分页 + 每行补库存与累计销量指标。
     *
     * <p>库存：本页商品全部 SKU → inventory.api 批查可用量 → 按商品 sum（分列已有 min/max，库存是运营要看的总可售）。
     * 销量：order.api 按已完成订单聚合（口径见 {@link ProductSoldReadQuery}）。
     * 库存/销量都是纯展示指标，与 SPU 状态正交（草稿/仓库中也可能有历史销量）。
     */
    public PageResult<ProductListRow> pageListWithMetrics(
            UUID shopId, ProductStatus status, String keyword, long page, long size) {
        PageResult<Product> result = pageList(shopId, status, keyword, page, size);
        List<UUID> productIds = result.records().stream().map(Product::getId).toList();
        if (productIds.isEmpty()) {
            return new PageResult<>(List.of(), result.total());
        }

        // 批次捞本页全部 SKU → 按商品分组，再批查库存可用量
        List<Sku> skus = skuMapper.selectByProductIds(productIds);
        Map<UUID, List<Sku>> skusByProduct = skus.stream().collect(Collectors.groupingBy(Sku::getProductId));
        Map<UUID, StockView> stocks =
                stockReadQuery.availableBySkuIds(skus.stream().map(Sku::getId).toList());
        // stock 缺省 0：SKU 无库存行也在 Map 外，按 0 兜底
        Map<UUID, Integer> stockByProduct = new HashMap<>();
        skusByProduct.forEach((pid, list) -> stockByProduct.put(
                pid,
                list.stream()
                        .mapToInt(s -> {
                            StockView v = stocks.get(s.getId());
                            return v == null ? 0 : v.availableStock();
                        })
                        .sum()));

        // 销量批查（已完成订单聚合），缺省 0
        Map<UUID, Long> soldByProduct = productSoldReadQuery.soldCountByProductIds(shopId, productIds);

        List<ProductListRow> rows = result.records().stream()
                .map(p -> new ProductListRow(
                        p, stockByProduct.getOrDefault(p.getId(), 0), soldByProduct.getOrDefault(p.getId(), 0L)))
                .toList();
        return new PageResult<>(rows, result.total());
    }

    /** 商品详情：SPU 全字段 + 全部 SKU，任何状态可查（管理端要能看草稿） */
    public ProductDetail detail(UUID productId) {
        Product product = requireShopOwned(productId);
        return new ProductDetail(product, skuMapper.selectByProductId(productId));
    }

    // ========== 买家侧公开读 ==========

    /**
     * 买家侧商品列表：可按类目/店铺/关键词筛选并排序。
     *
     * <p>与 pageList 的关键差别：status 写死上架，不接受前端指定，草稿/下架商品对买家不存在。 价格排序直接吃 minPrice/maxPrice 冗余副本，免查 SKU
     * 表——这两个字段的存在意义就在此。
     */
    public PageResult<Product> pagePublic(ProductQuery query, long page, long size) {
        // StringBuilder.blankToNull 与 pageList 同口径：no keyword 时归一为 null，免 NPE；hasText 再兜底
        String keyword = query.keyword() == null ? null : query.keyword().trim();
        LambdaQueryWrapper<Product> wrapper = new LambdaQueryWrapper<Product>()
                .eq(Product::getStatus, ProductStatus.PUBLISHED)
                .eq(query.categoryId() != null, Product::getCategoryId, query.categoryId())
                .eq(query.shopId() != null, Product::getShopId, query.shopId())
                .like(StringUtils.hasText(keyword), Product::getName, keyword);
        // 每种排序都补 id 兜底，保证翻页时同值记录顺序稳定（否则第 2 页可能重复第 1 页的行）
        switch (query.sort() == null ? "newest" : query.sort()) {
            case "price_asc" -> wrapper.orderByAsc(Product::getMinPrice).orderByDesc(Product::getId);
            case "price_desc" -> wrapper.orderByDesc(Product::getMaxPrice).orderByDesc(Product::getId);
            default -> wrapper.orderByDesc(Product::getCreatedAt).orderByDesc(Product::getId);
        }
        Page<Product> result = productMapper.selectPage(new Page<>(page, size), wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal());
    }

    /** 买家侧商品详情：非上架商品一律 404（不泄露"存在但没上架"），SKU 只返在售 */
    public ProductDetail publicDetail(UUID productId) {
        Product product = Validate.notNull(productMapper.selectById(productId), "商品不存在");
        Validate.isTrue(product.isPublished(), 404, "商品不存在");
        List<Sku> skus = skuMapper.selectOnSaleByProductId(productId);
        return new ProductDetail(product, skus);
    }

    /**
     * 编辑基本信息（specs/SKU 之外的字段）。任何状态可改：上架后改展示字段/分类是日常运营，改规格走 updateSpecs。
     *
     * <p>统一用「实体 + updateById」而非 LambdaUpdateWrapper：detailImages / images / params 是 JSONB 列，
     * wrapper 的 {@code set(列, List)} 不携带 {@code @TableField(typeHandler)}，MP 把 ArrayList 当普通参数传入，
     * PG 无法推断数组类型直接 500（实测报「无法推测实例 java.util.ArrayList 的 SQL 类型」）。
     * 实体方案走实体的 typeHandler，JSONB ↔ List 序列化正确。
     *
     * <p>PATCH 语义（传 null 不写）在字段级保留：只 set 非 null 的字段；subtitle 例外——空串表示清空卖点，
     * 显式写给 null（blankToNull），因为 updateById 默认忽略 null 字段，故 subtitle 单独用 wrapper 子句。
     */
    @Transactional
    public Product updateBasic(UUID productId, UpdateBasicCommand command) {
        // 1. 校验：商品存在且属于当前店铺
        Product product = requireShopOwned(productId);
        // 1.1 类目变更（结构性操作）：PATCH 下 categoryId=null 表示不改；非 null 且与当前不同时仅草稿允许——
        //     上架/仓库中是经营资产（在售/已填完并关联 SKU 规格快照），换类目会错配规格/重新生产，需先下架再改。
        UUID targetCategory = command.categoryId();
        boolean categoryChanged = targetCategory != null && !targetCategory.equals(product.getCategoryId());
        if (categoryChanged) {
            Validate.isTrue(product.isDraft(), 409, "只有草稿可以修改类目，上架/仓库中商品请先下架");
            Validate.isTrue(categoryMapper.selectById(targetCategory) != null, "分类不存在");
        }
        // 2. params 模板校验：传了 params 用新值校验，没传（不改）则拿存量对有效类目复检（换类目可能撞上必填模板）
        UUID effectiveCategory = targetCategory != null ? targetCategory : product.getCategoryId();
        validateParams(effectiveCategory, command.params() != null ? command.params() : product.getParams());

        // 3. 实体局部更新：非 null 字段 set 到已加载的实体（JSONB 走实体 typeHandler）
        boolean nameChanged = command.name() != null && !command.name().equals(product.getName());
        if (categoryChanged) {
            product.setCategoryId(targetCategory);
        }
        if (nameChanged) {
            product.setName(command.name());
        }
        if (command.subtitle() != null) {
            product.setSubtitle(blankToNull(command.subtitle()));
        }
        if (command.detailImages() != null) {
            product.setDetailImages(command.detailImages());
        }
        if (command.mainImage() != null) {
            product.setMainImage(command.mainImage());
        }
        if (command.images() != null) {
            product.setImages(command.images());
        }
        if (command.params() != null) {
            product.setParams(command.params());
        }
        // 4. subtitle「清空调」：空串传进来 = 想清空卖点，而 updateById 忽略 null 字段，用 wrapper 子句单独写 null
        if (command.subtitle() != null && blankToNull(command.subtitle()) == null) {
            productMapper.update(
                    null,
                    new LambdaUpdateWrapper<Product>()
                            .eq(Product::getId, productId)
                            .set(Product::getSubtitle, null));
        }
        productMapper.updateById(product);
        // 5. SKU 名是「SPU名+规格值」的快照（见 buildSkuName）：SPU 改名后刷一遍存量 SKU 名，
        //    避免购物车/订单/列表里留旧标题。规格值不变则组合不变，name 只是拼串，刷新安全。
        if (nameChanged) {
            refreshSkuNames(product, skuMapper.selectByProductId(productId));
        }
        return product;
    }

    /** 下架：仅上架商品可下架。不做物理删除，下架即"删除"语义，可无损恢复 */
    @Transactional
    public Product off(UUID productId) {
        Product product = requireShopOwned(productId);
        // 守卫 + 置下架（仅上架可下架的规则在实体内），乐观锁条件更新，见 requireTransition
        product.off();
        requireTransition(productId, ProductStatus.PUBLISHED, ProductStatus.WAREHOUSE, "商品状态已变化，请刷新后重试");
        return product;
    }

    /** 重新上架：仅下架商品可上架，复检发布门槛（下架期间 SKU 可能被改） */
    @Transactional
    public Product on(UUID productId) {
        Product product = requireShopOwned(productId);
        // 1. 复检发布门槛：下架期间 SKU 可能被改（在售 SKU 口径，见 ensurePublishable）
        ensurePublishable(productId);
        // 2. 守卫 + 置上架（仅下架可重上的规则在实体内），乐观锁条件更新
        product.relist();
        requireTransition(productId, ProductStatus.WAREHOUSE, ProductStatus.PUBLISHED, "商品状态已变化，请刷新后重试");
        return product;
    }

    /** 放弃（删除）草稿：仅草稿可删，同事务清 SKU + 库存行，避免草稿箱堆积废弃草稿。
     *  上架/下架商品是经营资产，不做物理删除（走 off）——此删除入口只服务「不发了，扔掉这个草稿」。 */
    @Transactional
    public void abandon(UUID productId) {
        // 1. 归属 + 守卫：商品存在且属于当前店铺、仅草稿可放弃（规则在实体内）
        Product product = requireShopOwned(productId);
        product.ensureAbandonable();
        // 2. 同事务清 SKU + 库存主体行（对齐 updateSpecs 删除组合的先例：先清库存行再删 SKU）
        List<Sku> skus = skuMapper.selectByProductId(productId);
        for (Sku sku : skus) {
            stockCommand.removeRow(sku.getId());
            skuMapper.deleteById(sku.getId());
        }
        // 3. 删 SPU
        productMapper.deleteById(productId);
    }

    // ========== 私有辅助 ==========

    /**
     * 归属校验：商品存在（404）且属于当前店铺上下文（X-Shop-Id 对应的 shopId，否则 403）。
     * 所有按 ID 操作商品的入口统一走这里，防止跨店读写。
     */
    private Product requireShopOwned(UUID productId) {
        Product product = Validate.notNull(productMapper.selectById(productId), "商品不存在");
        if (!product.getShopId().equals(ShopIdHolder.get())) {
            throw BusinessException.forbidden("商品不属于当前店铺");
        }
        return product;
    }

    /** 规格选择 → 模板解析：校验 attr/value 归属与状态，受理卖家自定义值，产出落库的 specs 快照 */
    private List<SpecItem> resolveSelections(Product product, List<SpecSelection> selections) {
        // 属性与值域一次批量捞进 Map，循环体退化为纯内存谓词——旧版逐条 selectById 在
        // 「3 维度 × 每维 10 值」下要往返 34 次，而 updateSpecs 是卖家高频操作
        Map<UUID, CategoryAttr> attrsById =
                byId(attrMapper, selections.stream().map(SpecSelection::attrId).toList(), CategoryAttr::getId);
        Map<UUID, CategoryAttrValue> valuesById = byId(
                attrValueMapper,
                selections.stream()
                        .map(SpecSelection::valueIds)
                        .filter(Objects::nonNull)
                        .flatMap(List::stream)
                        .toList(),
                CategoryAttrValue::getId);

        List<SpecItem> specs = new ArrayList<>();
        for (SpecSelection sel : selections) {
            CategoryAttr attr = Validate.notNull(attrsById.get(sel.attrId()), "规格属性不存在");
            Validate.isTrue(attr.isEnabled(), "规格属性已禁用");
            Validate.isTrue(attr.getCategoryId().equals(product.getCategoryId()), "规格属性不属于商品当前类目");
            Validate.isTrue(attr.getKind() == AttrKind.SPEC, "非销售属性不能作为规格");

            List<SpecValue> values = new ArrayList<>();
            if (sel.valueIds() != null) {
                // LinkedHashSet 去重：同值重复选择会撞 uk_skus_product_spec_key
                for (UUID valueId : new LinkedHashSet<>(sel.valueIds())) {
                    CategoryAttrValue row = valuesById.get(valueId);
                    Validate.isTrue(row != null && row.getAttrId().equals(attr.getId()), "规格值不存在或不属于该属性");
                    String image =
                            sel.valueImages() == null ? null : sel.valueImages().get(valueId);
                    persistValueImage(row, image);
                    values.add(new SpecValue(row.getId(), row.getValue(), image));
                }
            }
            if (sel.customValues() != null) {
                for (String raw : sel.customValues()) {
                    String value = raw == null ? "" : raw.trim();
                    Validate.isTrue(!value.isEmpty(), "自定义规格值不能为空");
                    Validate.isTrue(Boolean.TRUE.equals(attr.getAllowCustom()), "该属性不允许自定义值");
                    // 自定义值必须逐条 upsert（要建档），无法批量预取
                    CategoryAttrValue row = categoryAttrService.ensureSellerValue(attr.getId(), value);
                    // 同名复用：与 valueIds 已选值撞同行时去重
                    if (values.stream().noneMatch(v -> v.valueId().equals(row.getId()))) {
                        String image = sel.customValueImages() == null
                                ? null
                                : sel.customValueImages().get(value);
                        persistValueImage(row, image);
                        values.add(new SpecValue(row.getId(), row.getValue(), image));
                    }
                }
            }
            Validate.isTrue(!values.isEmpty(), "每个规格至少选择一个值");
            specs.add(new SpecItem(attr.getId(), attr.getName(), values));
        }
        return specs;
    }

    /** 规格值的默认图落到 category_attr_values.image（仅在值变化时写，避免无谓更新） */
    private void persistValueImage(CategoryAttrValue row, String image) {
        if (image == null) return;
        if (Objects.equals(row.getImage(), image)) return;
        row.setImage(image);
        attrValueMapper.updateById(row);
    }

    /** 批量按主键取行 → id → 实体 Map；空集合不发查询（空 IN 列表在 MP 下会退化成全表扫） */
    private static <T> Map<UUID, T> byId(BaseMapper<T> mapper, List<UUID> ids, Function<T, UUID> idOf) {
        Set<UUID> distinct = ids.stream().filter(Objects::nonNull).collect(Collectors.toSet());
        if (distinct.isEmpty()) {
            return Map.of();
        }
        return mapper.selectByIds(distinct).stream().collect(Collectors.toMap(idOf, Function.identity()));
    }

    /**
     * params 模板校验：类目存在参数模板（kind=2 启用条目）时——提交的 attrId 必须属于模板、
     * required 必须有值、allow_custom=false 且有值域时值须在值域内；类目无模板维持自由文本（attrId=null）。
     */
    private void validateParams(UUID categoryId, List<ParamItem> params) {
        List<CategoryAttr> template = attrMapper.selectList(new LambdaQueryWrapper<CategoryAttr>()
                .eq(CategoryAttr::getCategoryId, categoryId)
                .eq(CategoryAttr::getKind, AttrKind.PARAM)
                .eq(CategoryAttr::getStatus, CategoryAttrStatus.ENABLED));
        if (template.isEmpty()) {
            return;
        }
        Map<UUID, CategoryAttr> byId =
                template.stream().collect(Collectors.toMap(CategoryAttr::getId, Function.identity()));
        List<ParamItem> items = params == null ? List.of() : params;

        // 1. 值域一次性按整个模板捞出并按 attrId 分组：旧版在 param 循环里逐个 selectList，
        //    N 个受控参数 = N 次往返，而这里的候选集本就限定在同一类目模板内
        Map<UUID, Set<String>> domainByAttr = attrValueMapper
                .selectList(new LambdaQueryWrapper<CategoryAttrValue>().in(CategoryAttrValue::getAttrId, byId.keySet()))
                .stream()
                .collect(Collectors.groupingBy(
                        CategoryAttrValue::getAttrId,
                        Collectors.mapping(CategoryAttrValue::getValue, Collectors.toSet())));

        // 2. 提交的每条 param 必须关联本类目模板属性；值域受控（allow_custom=false 且有值域）时值须在值域内
        for (ParamItem item : items) {
            CategoryAttr attr = item.attrId() == null ? null : byId.get(item.attrId());
            Validate.isTrue(attr != null, "参数必须关联类目模板属性");
            if (!Boolean.TRUE.equals(attr.getAllowCustom())) {
                Set<String> domain = domainByAttr.getOrDefault(attr.getId(), Set.of());
                if (!domain.isEmpty()) {
                    Validate.isTrue(domain.contains(item.value()), "参数值不在值域内：" + attr.getName());
                }
            }
        }

        // 3. required 的 param 必须有值
        for (CategoryAttr attr : template) {
            if (Boolean.TRUE.equals(attr.getRequired())) {
                boolean filled =
                        items.stream().anyMatch(i -> attr.getId().equals(i.attrId()) && StringUtils.hasText(i.value()));
                Validate.isTrue(filled, "缺少必填参数：" + attr.getName());
            }
        }
    }

    /** 笛卡尔积：specs 为空时返回 [[]]，恰好对应单规格商品的 1 个隐藏 SKU；取值按 valueId 去重 */
    private List<List<SpecValue>> cartesian(List<SpecItem> specs) {
        List<List<SpecValue>> result = new ArrayList<>();
        result.add(new ArrayList<>());
        for (SpecItem dim : specs) {
            List<List<SpecValue>> next = new ArrayList<>();
            Map<UUID, SpecValue> dedup = new LinkedHashMap<>();
            for (SpecValue v : dim.values()) {
                dedup.putIfAbsent(v.valueId(), v);
            }
            for (List<SpecValue> prefix : result) {
                for (SpecValue value : dedup.values()) {
                    List<SpecValue> combo = new ArrayList<>(prefix);
                    combo.add(value);
                    next.add(combo);
                }
            }
            result = next;
        }
        return result;
    }

    /** 按模板顺序组装 SKU 规格取值快照：attrId/valueId 是身份，name/value 从模板读出 */
    private List<SkuAttr> buildAttributes(List<SpecItem> specs, List<SpecValue> combo) {
        List<SkuAttr> entries = new ArrayList<>();
        for (int i = 0; i < specs.size(); i++) {
            entries.add(new SkuAttr(
                    specs.get(i).attrId(),
                    combo.get(i).valueId(),
                    specs.get(i).name(),
                    combo.get(i).value()));
        }
        return entries;
    }

    /** SPU 名 + 规格值拼接，如「iPhone 15 Pro 256G 黑色」；单规格商品即 SPU 名本身。截断到列上限 160 */
    private String buildSkuName(Product product, List<SpecValue> combo) {
        return joinSkuName(product, combo.stream().map(SpecValue::value).toList());
    }

    /** 拼 SKU 名：SPU 名 + 各规格值空格连接；单规格/无规格即为 SPU 名本身。截断到列上限 160 */
    private static String joinSkuName(Product product, List<String> values) {
        String name = values.isEmpty() ? product.getName() : product.getName() + " " + String.join(" ", values);
        return name.length() > 160 ? name.substring(0, 160) : name;
    }

    /**
     * SKU 名是「SPU名 + 规格值」的快照：SPU 改名后对存量 SKU 重拼名字（规格值来自 SkuAttr 快照，
     * 只重拼 name 字符串，不动 spec_key / 价格 / 库存）。买家侧购物车/订单里的 SKU 名随之一致。
     */
    private void refreshSkuNames(Product product, List<Sku> skus) {
        for (Sku sku : skus) {
            List<String> values = sku.getAttributes() == null
                    ? List.of()
                    : sku.getAttributes().stream().map(SkuAttr::value).toList();
            sku.setName(joinSkuName(product, values));
            skuMapper.updateById(sku);
        }
    }

    /**
     * 状态迁移乐观锁：只用条件更新「where status=from → set status=to」，affected=0 说明并发下状态已变
     * （读-判-写之间的竞争窗口被挡），抛 409 让调用方刷新重试；返回的实体字段由调用方另行落库。
     */
    private void requireTransition(UUID productId, ProductStatus from, ProductStatus to, String detail) {
        int affected = productMapper.update(
                null,
                new LambdaUpdateWrapper<Product>()
                        .eq(Product::getId, productId)
                        .eq(Product::getStatus, from)
                        .set(Product::getStatus, to));
        if (affected == 0) {
            throw BusinessException.conflict(null, detail);
        }
    }

    /** 发布门槛：必须有 SKU，且所有 SKU 都设了价（库存允许 0，可售罄上架）。publish 与 on 共用 */
    private List<Sku> ensurePublishable(UUID productId) {
        List<Sku> skus = skuMapper.selectByProductId(productId);
        // 发布/重上门槛只看「在售 SKU」：停用 SKU 不计入（停用 SKU 不该阻塞上架，也不该被索取价格）
        List<Sku> onSale =
                skus.stream().filter(s -> s.getStatus() == SkuStatus.ON_SALE).toList();
        Validate.isTrue(!onSale.isEmpty(), "请先设置商品规格");
        boolean anyMissingPrice = onSale.stream().anyMatch(s -> s.getPrice() == null);
        Validate.isTrue(!anyMissingPrice, "所有在售 SKU 都需设置价格后才能发布");
        return skus;
    }

    /** 一次算好 min/max 价格冗余副本（真实成交价永远以 skus.price 为准；全部未定价时两端为 null）。publish 与 recalc 共用 */
    private static void applyPriceRange(Product product, List<Sku> skus) {
        // 价格区间只反映「在售 SKU」（买家实际可购集）：停用 SKU 的价不计入，否则列表「¥299 起」可能摘自已停用 SKU，
        // 点进去买不到（publicDetail 只返在售）。真实成交价永远以 skus.price 为准，这里只是列表免查 SKU 的展示副本。
        List<Long> prices = skus.stream()
                .filter(s -> s.getStatus() == SkuStatus.ON_SALE)
                .map(Sku::getPrice)
                .filter(Objects::nonNull)
                .toList();
        product.setMinPrice(prices.stream().min(Long::compare).orElse(null));
        product.setMaxPrice(prices.stream().max(Long::compare).orElse(null));
    }

    /** 「没填」与「清空」入库都落 null：空串只是传输层用来表达清空的信号，不进 DB */
    private static String blankToNull(String text) {
        return text == null || text.isBlank() ? null : text;
    }

    /** 组装草稿实体。草稿没有 SKU，故价格字段留空、specs 为 [] */
    private Product toDraftEntity(CreateProductCommand command) {
        return Product.builder()
                .shopId(command.shopId())
                .categoryId(command.categoryId())
                .name(command.name())
                .subtitle(blankToNull(command.subtitle()))
                .detailImages(command.detailImages() == null ? List.of() : command.detailImages())
                .mainImage(command.mainImage())
                .images(command.images())
                .specs(List.of())
                .params(command.params())
                .status(ProductStatus.DRAFT)
                .build();
    }

    // ========== 入参 ==========

    /** 创建商品草稿的业务入参聚合 */
    public record CreateProductCommand(
            UUID shopId,
            UUID categoryId,
            String name,
            String subtitle,
            List<String> detailImages,
            String mainImage,
            List<String> images,
            List<ParamItem> params) {}

    /** 编辑商品基本信息的业务入参聚合（specs/SKU 之外的字段，与创建同字段去掉 shopId） */
    public record UpdateBasicCommand(
            UUID categoryId,
            String name,
            String subtitle,
            List<String> detailImages,
            String mainImage,
            List<String> images,
            List<ParamItem> params) {}

    /** 卖家工作台商品列表行：SPU + 库存/销量两个纯展示指标 */
    public record ProductListRow(Product product, int stock, long soldCount) {}

    /**
     * 一个规格维度的选择：attrId 定位模板属性，valueIds 选值域内值，customValues 提交值域外新值
     * （仅当 attr.allow_custom 时受理，自动建档 source=2）。两列表至少一非空（HTTP 层 @AssertTrue 先拦）。
     */
    public record SpecSelection(
            UUID attrId,
            List<UUID> valueIds,
            List<String> customValues,
            Map<UUID, String> valueImages,
            Map<String, String> customValueImages) {}
}
