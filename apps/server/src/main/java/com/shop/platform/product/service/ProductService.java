package com.shop.platform.product.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.common.Validate;
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

    private final ProductMapper productMapper;
    private final CategoryMapper categoryMapper;
    private final SkuMapper skuMapper;

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
        // 1. 校验：上架商品不能改规格（草稿/下架态可改）；规格名不能重复（重复会产生语义混淆的组合）
        Validate.isTrue(product.getStatus() != Product.STATUS_PUBLISHED, 409, "上架商品不能修改规格，请先下架");
        long distinctNames = specs.stream().map(SpecItem::name).distinct().count();
        Validate.isTrue(distinctNames == specs.size(), "规格名不能重复");

        // 2. 落规格模板，SKU 生成公式自此定死
        product.setSpecs(specs);
        productMapper.updateById(product);

        // 3. 算目标组合：按模板顺序做笛卡尔积
        List<List<String>> combos = cartesian(specs);

        // 4. 对账：组合没变的保留（价格库存不丢），新增的补 SKU
        //    现有 SKU 按 attributes 的 List<ParamItem> 值建索引（record 相等性 = JSON 值相等，见 updateSpecs javadoc）
        List<Sku> existing = skuMapper.selectList(new LambdaQueryWrapper<Sku>().eq(Sku::getProductId, productId));
        Map<List<ParamItem>, Sku> byAttrs = new LinkedHashMap<>();
        for (Sku sku : existing) {
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
                result.add(fresh);
            }
        }

        // 5. 组合消失的旧 SKU 删掉
        for (Sku removed : byAttrs.values()) {
            skuMapper.deleteById(removed.getId());
        }

        // 6. 重算价格区间（min/max 冗余副本随 SKU 变化同步）
        recalcPriceRange(productId);
        return result;
    }

    /** 批量更新 SKU。任何状态都允许：上架后补货/改价/停用是日常运营操作。price/stock 必填，其余只 set 非空字段 */
    @Transactional
    public List<Sku> updateSkus(UUID productId, List<SkuUpdateItem> items) {
        // 1. 商品必须存在且属于当前店铺（任何状态都允许改价/补货，是日常运营操作）
        requireShopOwned(productId);

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
                                .set(Sku::getPrice, item.price())
                                .set(Sku::getStock, item.stock()));
                Validate.isTrue(affected == 1, "SKU 不存在或不属于该商品");
            }
        } catch (DuplicateKeyException e) {
            // uk_skus_code 全局唯一索引兜底重复业务编码
            throw BusinessException.conflict(null, "SKU 编码已存在");
        }

        // 3. 重算价格区间并返回该商品全部 SKU
        recalcPriceRange(productId);
        return skuMapper.selectList(new LambdaQueryWrapper<Sku>().eq(Sku::getProductId, productId));
    }

    /** 发布：门槛是每个 SKU 都已设价（库存允许 0，可售罄上架），通过后置上架并回填聚合价格区间 */
    @Transactional
    public Product publish(UUID productId) {
        Product product = requireShopOwned(productId);
        // 1. 校验：仅草稿可发布
        Validate.isTrue(product.getStatus() == Product.STATUS_DRAFT, 409, "只有草稿可以发布");

        // 2. 校验门槛：必须有 SKU，且所有 SKU 都设了价（库存允许 0，可售罄上架）
        List<Sku> skus = ensurePublishable(productId);

        // 3. 回填聚合价格区间并置为上架
        product.setMinPrice(minPrice(skus));
        product.setMaxPrice(maxPrice(skus));
        product.setStatus(Product.STATUS_PUBLISHED);
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
        List<Sku> skus = skuMapper.selectList(new LambdaQueryWrapper<Sku>().eq(Sku::getProductId, productId));
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
        // 1. 状态校验：只有上架能下架
        Validate.isTrue(product.getStatus() == Product.STATUS_PUBLISHED, 409, "只有上架商品可以下架");
        // 2. 置下架并落库
        product.setStatus(Product.STATUS_OFF);
        productMapper.updateById(product);
        return product;
    }

    /** 重新上架：仅下架商品可上架，复检发布门槛（下架期间 SKU 可能被改） */
    @Transactional
    public Product on(UUID productId) {
        Product product = requireShopOwned(productId);
        // 1. 状态校验：只有下架能重新上架
        Validate.isTrue(product.getStatus() == Product.STATUS_OFF, 409, "只有下架商品可以重新上架");
        // 2. 复检发布门槛：有 SKU 且全部设价
        ensurePublishable(productId);
        // 3. 置上架
        product.setStatus(Product.STATUS_PUBLISHED);
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
        List<Sku> skus = skuMapper.selectList(new LambdaQueryWrapper<Sku>().eq(Sku::getProductId, productId));
        Validate.isTrue(!skus.isEmpty(), "请先设置商品规格");
        boolean anyMissingPrice = skus.stream().anyMatch(s -> s.getPrice() == null);
        Validate.isTrue(!anyMissingPrice, "所有 SKU 都需设置价格后才能发布");
        return skus;
    }

    /** 从全部 SKU 重算 minPrice/maxPrice 冗余副本（真实成交价永远以 skus.price 为准） */
    private void recalcPriceRange(UUID productId) {
        Product product = productMapper.selectById(productId);
        List<Sku> skus = skuMapper.selectList(new LambdaQueryWrapper<Sku>().eq(Sku::getProductId, productId));
        product.setMinPrice(minPrice(skus));
        product.setMaxPrice(maxPrice(skus));
        productMapper.updateById(product);
    }

    private static Long minPrice(List<Sku> skus) {
        return skus.stream()
                .map(Sku::getPrice)
                .filter(Objects::nonNull)
                .min(Long::compare)
                .orElse(null);
    }

    private static Long maxPrice(List<Sku> skus) {
        return skus.stream()
                .map(Sku::getPrice)
                .filter(Objects::nonNull)
                .max(Long::compare)
                .orElse(null);
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
