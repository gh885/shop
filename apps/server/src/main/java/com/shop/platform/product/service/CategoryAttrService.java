package com.shop.platform.product.service;

import com.shop.platform.common.Validate;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.mapper.CategoryAttr;
import com.shop.platform.product.mapper.CategoryAttrMapper;
import com.shop.platform.product.mapper.CategoryAttrValue;
import com.shop.platform.product.mapper.CategoryAttrValueMapper;
import com.shop.platform.product.mapper.CategoryMapper;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SkuMapper;
import com.shop.platform.product.model.AttrKind;
import com.shop.platform.product.model.AttrValueSource;
import com.shop.platform.product.model.CategoryAttrStatus;
import com.shop.platform.product.model.ParamItem;
import com.shop.platform.product.model.SkuAttr;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 类目属性模板：叶子类目挂销售属性/非销售参数模板，卖家发商品按模板选值，可扩充（allow_custom）。
 *
 * <p>规格值 ID 化的落点：SKU 以 valueId 组合（spec_key）为身份，规格值改名只是改 value 快照——
 * 本服务的 {@link #updateValue} 在同事务内刷新所有引用 SKU 的 attributes/name 快照，价格/库存/spec_key 不动（"改名不丢价"）。
 */
@Service
@RequiredArgsConstructor
public class CategoryAttrService {

    private final CategoryMapper categoryMapper;
    private final CategoryAttrMapper attrMapper;
    private final CategoryAttrValueMapper valueMapper;
    private final SkuMapper skuMapper;
    private final ProductMapper productMapper;

    /** 管理端模板：全量属性（含禁用）+ 值域，按 sort 排序 */
    public List<CategoryAttrNode> listTemplate(UUID categoryId) {
        return buildTemplate(categoryId, false);
    }

    /** 公开模板（卖家发布页/买家详情页）：仅启用属性 */
    public List<CategoryAttrNode> publicTemplate(UUID categoryId) {
        return buildTemplate(categoryId, true);
    }

    /** 新建模板属性。只允许叶子类目（level=3，同商品挂载规则）；同类目重名 409（唯一索引兜底） */
    @Transactional
    public CategoryAttr createAttr(
            UUID categoryId,
            String name,
            AttrKind kind,
            Boolean required,
            Boolean allowCustom,
            Boolean allowImage,
            Integer sort) {
        Category category = Validate.notNull(categoryMapper.selectById(categoryId), "类目不存在");
        Validate.isTrue(category.getLevel() == 3, "只有叶子类目（三级）才能挂属性模板");
        CategoryAttr attr = CategoryAttr.builder()
                .categoryId(categoryId)
                .name(name)
                .kind(kind)
                .required(required != null ? required : false)
                .allowCustom(allowCustom != null ? allowCustom : true)
                .allowImage(allowImage != null ? allowImage : false)
                .sort(sort != null ? sort : 0)
                .status(CategoryAttrStatus.ENABLED)
                .build();
        DuplicateKeys.conflictOnDuplicate(() -> attrMapper.insert(attr), "该类目下已存在同名属性");
        return attr;
    }

    /** 更新属性定义（名称/必填/允许扩充/排序）。kind 创建后不可改：销售属性改参数会让存量 SKU 失去出处 */
    @Transactional
    public CategoryAttr updateAttr(
            UUID attrId, String name, Boolean required, Boolean allowCustom, Boolean allowImage, Integer sort) {
        CategoryAttr attr = requireAttr(attrId);
        attr.setName(name);
        if (required != null) attr.setRequired(required);
        if (allowCustom != null) attr.setAllowCustom(allowCustom);
        if (allowImage != null) attr.setAllowImage(allowImage);
        if (sort != null) attr.setSort(sort);
        DuplicateKeys.conflictOnDuplicate(() -> attrMapper.updateById(attr), "该类目下已存在同名属性");
        return attr;
    }

    /** 启用/禁用属性。同 categories 语义：查询侧裁剪不写扩散，已被引用的存量 SKU 快照自洽，新商品不可再选 */
    @Transactional
    public void updateAttrStatus(UUID attrId, CategoryAttrStatus status) {
        CategoryAttr attr = requireAttr(attrId);
        attr.setStatus(status);
        attrMapper.updateById(attr);
    }

    /** 平台预置值（{@link AttrValueSource#PLATFORM}）。同属性重名 409（唯一索引兜底） */
    @Transactional
    public CategoryAttrValue addValue(UUID attrId, String value, Integer sort, String image) {
        requireAttr(attrId);
        CategoryAttrValue row = CategoryAttrValue.builder()
                .attrId(attrId)
                .value(value)
                .sort(sort != null ? sort : 0)
                .source(AttrValueSource.PLATFORM)
                .image(image)
                .build();
        DuplicateKeys.conflictOnDuplicate(() -> valueMapper.insert(row), "该属性下已存在同名值");
        return row;
    }

    /**
     * 改值名/排序。改名同事务刷新所有引用 SKU 的 attributes 快照与显示名：
     * spec_key（valueId 组合）不动 → SKU 身份不变，价格库存不丢。
     */
    @Transactional
    public CategoryAttrValue updateValue(UUID valueId, String value, Integer sort, String image) {
        // 1. 改值名/图（唯一索引兜底同属性重名）
        CategoryAttrValue row = Validate.notNull(valueMapper.selectById(valueId), "属性值不存在");
        row.setValue(value);
        if (image != null) row.setImage(image);
        if (sort != null) row.setSort(sort);
        DuplicateKeys.conflictOnDuplicate(() -> valueMapper.updateById(row), "该属性下已存在同名值");

        // 2. 圈定引用 SKU：attributes 含该 valueId（JSONB containment，走 idx_skus_attributes_gin），
        //    重读重写快照。SPU 名批量取一次——按 productId 逐条点查会随引用 SKU 数放大成 N+1
        List<Sku> affected = skuMapper.selectByValueId(valueId);
        if (affected.isEmpty()) {
            return row;
        }
        Map<UUID, Product> products =
                productMapper
                        .selectByIds(affected.stream()
                                .map(Sku::getProductId)
                                .distinct()
                                .toList())
                        .stream()
                        .collect(Collectors.toMap(Product::getId, p -> p));
        for (Sku sku : affected) {
            List<SkuAttr> attrs = sku.getAttributes().stream()
                    .map(a -> a.valueId().equals(valueId) ? new SkuAttr(a.attrId(), a.valueId(), a.name(), value) : a)
                    .toList();
            sku.setAttributes(attrs);
            sku.setName(Sku.nameOf(
                    products.get(sku.getProductId()),
                    attrs.stream().map(SkuAttr::value).toList()));
            skuMapper.updateById(sku);
        }
        return row;
    }

    /**
     * 卖家扩充值：值域外新值自动建档（source=2），同名复用（含平台预置值，不改其 source）。
     * 供 SkuService.updateSpecs 受理 customValues。
     *
     * <p>一条 upsert 落库——不能靠 catch
     * DuplicateKeyException 回读：PG 撞唯一索引即中止整个事务，catch 后发不出任何语句。
     */
    @Transactional
    public CategoryAttrValue ensureSellerValue(UUID attrId, String value) {
        return valueMapper.upsertSellerValue(attrId, value);
    }

    /**
     * params 模板校验（商品建草稿 / 改基本信息时调用）：类目存在参数模板（kind=2 启用条目）时——提交的 attrId 必须属于模板、
     * required 必须有值、allow_custom=false 且有值域时值须在值域内；类目无模板维持自由文本（attrId=null）。
     */
    public void validateParams(UUID categoryId, List<ParamItem> params) {
        List<CategoryAttr> template = attrMapper.selectParamTemplate(categoryId);
        if (template.isEmpty()) {
            return;
        }
        Map<UUID, CategoryAttr> byId = template.stream().collect(Collectors.toMap(CategoryAttr::getId, a -> a));
        List<ParamItem> items = params == null ? List.of() : params;

        // 1. 值域一次性按整个模板捞出并按 attrId 分组：旧版在 param 循环里逐个 selectList，
        //    N 个受控参数 = N 次往返，而这里的候选集本就限定在同一类目模板内
        Map<UUID, Set<String>> domainByAttr = valueMapper.selectByAttrIds(byId.keySet()).stream()
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

    private CategoryAttr requireAttr(UUID attrId) {
        return Validate.notNull(attrMapper.selectById(attrId), "属性不存在");
    }

    private List<CategoryAttrNode> buildTemplate(UUID categoryId, boolean enabledOnly) {
        List<CategoryAttr> attrs = attrMapper.selectByCategory(categoryId, enabledOnly);
        if (attrs.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<CategoryAttrValue>> valuesByAttr =
                valueMapper
                        .selectByAttrIds(attrs.stream().map(CategoryAttr::getId).toList())
                        .stream()
                        .collect(Collectors.groupingBy(CategoryAttrValue::getAttrId));
        List<CategoryAttrNode> nodes = new ArrayList<>();
        for (CategoryAttr attr : attrs) {
            List<CategoryAttrValue> values = valuesByAttr.getOrDefault(attr.getId(), List.of()).stream()
                    .sorted(Comparator.comparing(CategoryAttrValue::getSort)
                            .thenComparing(CategoryAttrValue::getCreatedAt))
                    .toList();
            nodes.add(new CategoryAttrNode(attr, values));
        }
        return nodes;
    }
}
