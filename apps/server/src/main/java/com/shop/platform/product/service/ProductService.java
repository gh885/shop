package com.shop.platform.product.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.shop.platform.common.Validate;
import com.shop.platform.product.mapper.CategoryMapper;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SkuMapper;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/** 商品 SPU 服务：创建（草稿）→ 规格 → SKU → 发布，逐步补充。 */
@Service
@RequiredArgsConstructor
public class ProductService {

    /** 商品状态，见 V6 迁移 status 注释：1 上架 / 0 下架 / 2 草稿 */
    private static final int STATUS_DRAFT = 2;

    private static final int STATUS_PUBLISHED = 1;

    private final ProductMapper productMapper;
    private final CategoryMapper categoryMapper;
    private final SkuMapper skuMapper;
    private final ObjectMapper objectMapper;

    /** 创建商品草稿：只落基本信息，specs/SKU 由后续接口补充 */
    public Product create(CreateProductCommand command) {
        ensureCategoryExists(command.categoryId());
        Product draft = toDraftEntity(command);
        productMapper.insert(draft);
        return draft;
    }

    /**
     * 更新销售属性模板，并按新模板对账 SKU：规格组合没变的保留（价格库存不丢）、组合消失的删除、组合新增的按笛卡尔积生成。
     *
     * <p>attributes 按模板顺序序列化，保证 uk_skus_product_attrs 唯一索引对同一组合生成相同字符串。 已知限制：规格值改名（黑→曜石黑）会被视为新组合，旧
     * SKU 删、价格丢失（淘宝的属性映射本次不做）。
     */
    @Transactional
    public List<Sku> updateSpecs(UUID productId, List<SpecItem> specs) {
        Product product = Validate.notNull(productMapper.selectById(productId), "商品不存在");
        // 1. 校验：仅草稿可改规格；规格名不能重复（重复会产生语义混淆的组合）
        Validate.isTrue(product.getStatus() == STATUS_DRAFT, 409, "只有草稿可以修改规格");
        long distinctNames = specs.stream().map(SpecItem::name).distinct().count();
        Validate.isTrue(distinctNames == specs.size(), "规格名不能重复");

        // 2. 落规格模板，SKU 生成公式自此定死
        product.setSpecs(toJsonOrEmpty(specs));
        productMapper.updateById(product);

        // 3. 算目标组合：按模板顺序做笛卡尔积
        List<List<String>> combos = cartesian(specs);

        // 4. 对账：组合没变的保留（价格库存不丢），新增的补 SKU
        //    现有 SKU 按 attributes 签名建索引（两侧都 canonicalize：见 helper 注释）
        List<Sku> existing = skuMapper.selectList(new LambdaQueryWrapper<Sku>().eq(Sku::getProductId, productId));
        Map<String, Sku> byAttrs = new LinkedHashMap<>();
        for (Sku sku : existing) {
            byAttrs.put(canonicalize(sku.getAttributes()), sku);
        }

        List<Sku> result = new ArrayList<>();
        for (List<String> combo : combos) {
            String attrsJson = canonicalize(buildAttributes(specs, combo));
            Sku kept = byAttrs.remove(attrsJson);
            if (kept != null) {
                result.add(kept);
            } else {
                Sku fresh = Sku.builder()
                        .productId(productId)
                        .attributes(attrsJson)
                        .name(buildSkuName(product, combo))
                        .status(1) // SKU 在售 1 / 停用 0，与 SPU 状态无关
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

    /** 批量更新 SKU 价格/库存。任何状态都允许：上架后补货/改价是日常运营操作 */
    @Transactional
    public List<Sku> updateSkus(UUID productId, List<SkuUpdateItem> items) {
        // 1. 商品必须存在（任何状态都允许改价/补货，是日常运营操作）
        Validate.notNull(productMapper.selectById(productId), "商品不存在");

        // 2. 逐条更新：WHERE 同时校验 SKU 归属，只 set 非空字段（名称/图/划线价可空，price/stock 必填）
        for (SkuUpdateItem item : items) {
            int affected = skuMapper.update(
                    null,
                    new LambdaUpdateWrapper<Sku>()
                            .eq(Sku::getId, item.skuId())
                            .eq(Sku::getProductId, productId)
                            .set(item.name() != null, Sku::getName, item.name())
                            .set(item.image() != null, Sku::getImage, item.image())
                            .set(item.originalPrice() != null, Sku::getOriginalPrice, item.originalPrice())
                            .set(Sku::getPrice, item.price())
                            .set(Sku::getStock, item.stock()));
            Validate.isTrue(affected == 1, "SKU 不存在或不属于该商品");
        }

        // 3. 重算价格区间并返回该商品全部 SKU
        recalcPriceRange(productId);
        return skuMapper.selectList(new LambdaQueryWrapper<Sku>().eq(Sku::getProductId, productId));
    }

    /** 发布：门槛是每个 SKU 都已设价（库存允许 0，可售罄上架），通过后置上架并回填聚合价格区间 */
    @Transactional
    public Product publish(UUID productId) {
        Product product = Validate.notNull(productMapper.selectById(productId), "商品不存在");
        // 1. 校验：仅草稿可发布
        Validate.isTrue(product.getStatus() == STATUS_DRAFT, 409, "只有草稿可以发布");

        // 2. 校验门槛：必须有 SKU，且所有 SKU 都设了价（库存允许 0，可售罄上架）
        List<Sku> skus = skuMapper.selectList(new LambdaQueryWrapper<Sku>().eq(Sku::getProductId, productId));
        Validate.isTrue(!skus.isEmpty(), "请先设置商品规格");
        boolean anyMissingPrice = skus.stream().anyMatch(s -> s.getPrice() == null);
        Validate.isTrue(!anyMissingPrice, "所有 SKU 都需设置价格后才能发布");

        // 3. 回填聚合价格区间并置为上架
        product.setMinPrice(minPrice(skus));
        product.setMaxPrice(maxPrice(skus));
        product.setStatus(STATUS_PUBLISHED);
        productMapper.updateById(product);
        return product;
    }

    // ========== 私有辅助 ==========

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

    /** 按模板顺序序列化规格取值，同一组合生成完全相同的 JSON 字符串 */
    private String buildAttributes(List<SpecItem> specs, List<String> combo) {
        List<Map<String, String>> entries = new ArrayList<>();
        for (int i = 0; i < specs.size(); i++) {
            Map<String, String> entry = new LinkedHashMap<>();
            entry.put("name", specs.get(i).name());
            entry.put("value", combo.get(i));
            entries.add(entry);
        }
        return toJson(entries);
    }

    /**
     * jsonb 文本统一签名：DB 读回的是 PG 规范形式（冒号/逗号后带空格），与新生成的紧凑 JSON 不一致， 直接当字符串比较会对账失配。解析后再序列化，两侧得到一致的紧凑签名。
     */
    private String canonicalize(String json) {
        try {
            return objectMapper.writeValueAsString(objectMapper.readValue(json, Object.class));
        } catch (JacksonException e) {
            throw new IllegalStateException("解析 attributes JSON 失败", e);
        }
    }

    /** SPU 名 + 规格值拼接，如「iPhone 15 Pro 256G 黑色」；单规格商品即 SPU 名本身。截断到列上限 160 */
    private String buildSkuName(Product product, List<String> combo) {
        String name = combo.isEmpty() ? product.getName() : product.getName() + " " + String.join(" ", combo);
        return name.length() > 160 ? name.substring(0, 160) : name;
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

    /** 分类必须存在，否则草稿引用不存在的分类，将来发布会莫名失败 */
    private void ensureCategoryExists(UUID categoryId) {
        Validate.isTrue(categoryMapper.selectById(categoryId) != null, "分类不存在");
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
                .images(toJsonOrEmpty(command.images()))
                .specs("[]")
                .params(toJsonOrEmpty(command.params()))
                .status(STATUS_DRAFT)
                .build();
    }

    /** List → JSON 字符串；空列表统一存 "[]"，与 JSONB 列 DEFAULT 保持一致 */
    private String toJsonOrEmpty(List<?> values) {
        if (values == null || values.isEmpty()) {
            return "[]";
        }
        return toJson(values);
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException e) {
            throw new IllegalStateException("序列化 JSON 失败", e);
        }
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

    /** 非销售参数条目 {name, value}。HTTP 入参与此共用，见命名规范「子组件按语义命名」 */
    public record ParamItem(@NotBlank @Size(max = 32) String name, @NotBlank @Size(max = 64) String value) {}

    /** 销售属性维度 {name, values}，SKU 按各维取值笛卡尔积生成 */
    public record SpecItem(@NotBlank @Size(max = 32) String name, @NotEmpty List<@Size(max = 64) String> values) {}

    /** 单个 SKU 的价格/库存更新项，批量提交 */
    public record SkuUpdateItem(
            @NotNull UUID skuId,
            @Size(max = 160) String name,
            @Size(max = 255) String image,
            @NotNull @Min(0) Long price,
            @Min(0) Long originalPrice,
            @NotNull @Min(0) Integer stock) {}
}
