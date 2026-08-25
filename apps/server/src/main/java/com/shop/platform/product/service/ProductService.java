package com.shop.platform.product.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.common.Validate;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.product.dto.ProductQuery;
import com.shop.platform.product.dto.SkuUpdateItem;
import com.shop.platform.product.mapper.CategoryMapper;
import com.shop.platform.product.mapper.ParamItem;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SkuMapper;
import com.shop.platform.product.mapper.SpecItem;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 商品 SPU 服务：创建（草稿）→ 规格 → SKU → 发布，逐步补充。 */
@Service
@RequiredArgsConstructor
public class ProductService {

    /** 单商品 SKU 组合数上限（笛卡尔积总量校验，见 updateSpecs） */
    private static final int MAX_SKU_COMBINATIONS = 500;

    private final ProductMapper productMapper;
    private final CategoryMapper categoryMapper;
    private final SkuMapper skuMapper;
    private final StockCommand stockCommand;

    /** 创建商品草稿：只落基本信息，specs/SKU 由后续接口补充。shopId 由 controller 从店铺上下文（X-Shop-Id）注入 */
    public Product create(CreateProductCommand command) {
        Validate.isTrue(categoryMapper.selectById(command.categoryId()) != null, "分类不存在");
        Product draft = toDraftEntity(command);
        productMapper.insert(draft);
        return draft;
    }

    /**
     * 更新销售属性模板，并按新模板对账 SKU：规格组合没变的保留（价格库存不丢）、组合消失的删除、组合新增的按笛卡尔积生成。
     *
     * <p>attributes 按模板顺序组装 List<ParamItem>（record 值相等 = JSON 值相等），handler 按字段序固定序列化，保证
     * uk_skus_product_attrs 唯一索引对同一组合命中同一条。 已知限制：规格值改名（黑→曜石黑）会被视为新组合，旧 SKU 删、价格丢失（淘宝的属性映射本次不做）。
     */
    @Transactional
    public List<Sku> updateSpecs(UUID productId, List<SpecItem> specs) {
        Product product = requireShopOwned(productId);
        product.ensureSpecsEditable();
        long distinctNames = specs.stream().map(SpecItem::name).distinct().count();
        Validate.isTrue(distinctNames == specs.size(), "规格名不能重复");

        // 2. 落规格模板，SKU 生成公式自此定死
        product.setSpecs(specs);
        productMapper.updateById(product);

        // 3. 算目标组合：按模板顺序做笛卡尔积。总量封顶，防止误操作/恶意请求生成海量 SKU 拖垮库
        List<List<String>> combos = cartesian(specs);
        Validate.isTrue(combos.size() <= MAX_SKU_COMBINATIONS, "规格组合数过多（" + combos.size() + "），请精简规格后重试");

        // 4. 对账：组合没变的保留（价格库存不丢），新增的补 SKU
        //    现有 SKU 按 attributes 的 List<ParamItem> 值建索引（record 相等性 = JSON 值相等，见 updateSpecs javadoc）
        Map<List<ParamItem>, Sku> byAttrs = new LinkedHashMap<>();
        for (Sku sku : skuMapper.selectByProductId(productId)) {
            byAttrs.put(sku.getAttributes(), sku);
        }

        List<Sku> result = new ArrayList<>();
        for (List<String> combo : combos) {
            List<ParamItem> attrs = buildAttributes(specs, combo);
            Sku kept = byAttrs.remove(attrs);
            if (kept != null) {
                result.add(kept);
            } else {
                Sku fresh = Sku.builder()
                        .productId(productId)
                        .attributes(attrs)
                        .name(buildSkuName(product, combo))
                        .status(Sku.STATUS_ON_SALE)
                        .build();
                skuMapper.insert(fresh);
                // 库存主体行随 SKU 诞生（stock=0），卖家随后经 updateSkus 设总量
                stockCommand.ensureRow(fresh.getId());
                result.add(fresh);
            }
        }

        // 5. 组合消失的旧 SKU 删掉（库存主体行经 inventory :: api 同事务随行清理，流水账本保留）
        for (Sku removed : byAttrs.values()) {
            stockCommand.removeRow(removed.getId());
            skuMapper.deleteById(removed.getId());
        }

        // 6. 重算价格区间：SPU 与 SKU 都在手上，直接回填免重查
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

    /** 发布：门槛是每个 SKU 都已设价（库存允许 0，可售罄上架），通过后置上架并回填聚合价格区间 */
    @Transactional
    public Product publish(UUID productId) {
        Product product = requireShopOwned(productId);
        // 1. 复检发布门槛：每个 SKU 都已设价（跨聚合校验留 service）
        applyPriceRange(product, ensurePublishable(productId));
        // 2. 守卫 + 置上架（仅草稿可发布的规则在实体内）
        product.publish();
        productMapper.updateById(product);
        return product;
    }

    /** 商家后台商品列表：按店铺分页，可按状态/名称筛选，创建时间倒序。管理端要看全量状态，含草稿/下架 */
    public PageResult<Product> pageList(UUID shopId, Integer status, String keyword, long page, long size) {
        Page<Product> result = productMapper.selectPage(
                new Page<>(page, size),
                new LambdaQueryWrapper<Product>()
                        .eq(Product::getShopId, shopId)
                        .eq(status != null, Product::getStatus, status)
                        .like(keyword != null && !keyword.isBlank(), Product::getName, keyword.trim())
                        .orderByDesc(Product::getCreatedAt)
                        .orderByDesc(Product::getId));
        return new PageResult<>(result.getRecords(), result.getTotal());
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
        LambdaQueryWrapper<Product> wrapper = new LambdaQueryWrapper<Product>()
                .eq(Product::getStatus, Product.STATUS_PUBLISHED)
                .eq(query.categoryId() != null, Product::getCategoryId, query.categoryId())
                .eq(query.shopId() != null, Product::getShopId, query.shopId())
                .like(
                        query.keyword() != null && !query.keyword().isBlank(),
                        Product::getName,
                        query.keyword() == null ? null : query.keyword().trim());
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

    /** 编辑基本信息（specs/SKU 之外的字段）。任何状态可改：上架后改展示字段/分类是日常运营，改规格走 updateSpecs */
    public Product updateBasic(UUID productId, UpdateBasicCommand command) {
        // 1. 校验：商品存在且属于当前店铺、分类存在（同创建）
        requireShopOwned(productId);
        Validate.isTrue(categoryMapper.selectById(command.categoryId()) != null, "分类不存在");
        // 2. 局部更新：传 null 的字段不写（全库统一 PATCH 语义，见 apps/server/CLAUDE.md），WHERE 只有主键也走 wrapper——与 updateSkus 同形态
        productMapper.update(
                null,
                new LambdaUpdateWrapper<Product>()
                        .eq(Product::getId, productId)
                        .set(Product::getCategoryId, command.categoryId())
                        .set(Product::getName, command.name())
                        .set(command.subtitle() != null, Product::getSubtitle, command.subtitle())
                        .set(command.description() != null, Product::getDescription, command.description())
                        .set(command.mainImage() != null, Product::getMainImage, command.mainImage())
                        .set(command.images() != null, Product::getImages, command.images())
                        .set(command.params() != null, Product::getParams, command.params()));
        // 3. 查回：wrapper 不返回实体，重查保证响应与 DB 一致
        return productMapper.selectById(productId);
    }

    /** 下架：仅上架商品可下架。不做物理删除，下架即"删除"语义，可无损恢复 */
    @Transactional
    public Product off(UUID productId) {
        Product product = requireShopOwned(productId);
        // 守卫 + 置下架（仅上架可下架的规则在实体内）
        product.off();
        productMapper.updateById(product);
        return product;
    }

    /** 重新上架：仅下架商品可上架，复检发布门槛（下架期间 SKU 可能被改） */
    @Transactional
    public Product on(UUID productId) {
        Product product = requireShopOwned(productId);
        // 1. 复检发布门槛：下架期间 SKU 可能被改（跨聚合校验留 service）
        ensurePublishable(productId);
        // 2. 守卫 + 置上架（仅下架可重上的规则在实体内）
        product.relist();
        productMapper.updateById(product);
        return product;
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

    /** 笛卡尔积：specs 为空时返回 [[]]，恰好对应单规格商品的 1 个隐藏 SKU；取值用 LinkedHashSet 去重 */
    private List<List<String>> cartesian(List<SpecItem> specs) {
        List<List<String>> result = new ArrayList<>();
        result.add(new ArrayList<>());
        for (SpecItem dim : specs) {
            List<List<String>> next = new ArrayList<>();
            for (List<String> prefix : result) {
                for (String value : new LinkedHashSet<>(dim.values())) {
                    List<String> combo = new ArrayList<>(prefix);
                    combo.add(value);
                    next.add(combo);
                }
            }
            result = next;
        }
        return result;
    }

    /** 按模板顺序组装规格取值，同一组合生成值相等的 List<ParamItem>（record 相等性 = JSON 值相等） */
    private List<ParamItem> buildAttributes(List<SpecItem> specs, List<String> combo) {
        List<ParamItem> entries = new ArrayList<>();
        for (int i = 0; i < specs.size(); i++) {
            entries.add(new ParamItem(specs.get(i).name(), combo.get(i)));
        }
        return entries;
    }

    /** SPU 名 + 规格值拼接，如「iPhone 15 Pro 256G 黑色」；单规格商品即 SPU 名本身。截断到列上限 160 */
    private String buildSkuName(Product product, List<String> combo) {
        String name = combo.isEmpty() ? product.getName() : product.getName() + " " + String.join(" ", combo);
        return name.length() > 160 ? name.substring(0, 160) : name;
    }

    /** 发布门槛：必须有 SKU，且所有 SKU 都设了价（库存允许 0，可售罄上架）。publish 与 on 共用 */
    private List<Sku> ensurePublishable(UUID productId) {
        List<Sku> skus = skuMapper.selectByProductId(productId);
        Validate.isTrue(!skus.isEmpty(), "请先设置商品规格");
        boolean anyMissingPrice = skus.stream().anyMatch(s -> s.getPrice() == null);
        Validate.isTrue(!anyMissingPrice, "所有 SKU 都需设置价格后才能发布");
        return skus;
    }

    /** 一次算好 min/max 价格冗余副本（真实成交价永远以 skus.price 为准；全部未定价时两端为 null）。publish 与 recalc 共用 */
    private static void applyPriceRange(Product product, List<Sku> skus) {
        List<Long> prices =
                skus.stream().map(Sku::getPrice).filter(Objects::nonNull).toList();
        product.setMinPrice(prices.stream().min(Long::compare).orElse(null));
        product.setMaxPrice(prices.stream().max(Long::compare).orElse(null));
    }

    /** 组装草稿实体。草稿没有 SKU，故价格字段留空、specs 为 [] */
    private Product toDraftEntity(CreateProductCommand command) {
        return Product.builder()
                .shopId(command.shopId())
                .categoryId(command.categoryId())
                .name(command.name())
                .subtitle(command.subtitle())
                .description(command.description())
                .mainImage(command.mainImage())
                .images(command.images())
                .specs(List.of())
                .params(command.params())
                .status(Product.STATUS_DRAFT)
                .build();
    }

    // ========== 入参 ==========

    /** 创建商品草稿的业务入参聚合 */
    public record CreateProductCommand(
            UUID shopId,
            UUID categoryId,
            String name,
            String subtitle,
            String description,
            String mainImage,
            List<String> images,
            List<ParamItem> params) {}

    /** 编辑商品基本信息的业务入参聚合（specs/SKU 之外的字段，与创建同字段去掉 shopId） */
    public record UpdateBasicCommand(
            UUID categoryId,
            String name,
            String subtitle,
            String description,
            String mainImage,
            List<String> images,
            List<ParamItem> params) {}
}
