package com.shop.platform.catalog.service;

import com.shop.platform.catalog.dto.CategoryTreeNode;
import com.shop.platform.catalog.dto.CreateCategoryRequest;
import com.shop.platform.catalog.mapper.CategoryConfigMapper;
import com.shop.platform.catalog.mapper.CategoryEntity;
import com.shop.platform.catalog.mapper.CategoryMapper;
import com.shop.platform.catalog.model.BrandPolicy;
import com.shop.platform.catalog.model.CategoryConfig;
import com.shop.platform.catalog.model.CategoryStatus;
import com.shop.platform.catalog.model.IdentityKind;
import com.shop.platform.catalog.model.ValueType;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.Ids;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 类目配置的读写。平台运营维护，商家只读。
 *
 * <p><b>L1/L2 是纯分组，没有配置。</b> 它们只描述"在哪"，不描述"要求什么"。
 * 这个分工落到表上就是 {@code category}（树）与 {@code category_config}（叶子配置）两张表——
 * 于是"L1 配了识别键会怎样"这类问题不存在，因为 L1 没有配置行可写。
 *
 * <p><b>叶子配置一次给齐。</b> 属性模板、识别键、品牌策略、资质、审核策略是出厂设置，
 * 后补代价极高——补的时候存量商品没有这些值。识别键尤其致命：白牌标品类目要是没定识别属性，
 * 参数哈希拼不出来，同款全归并错，而错配只能人工一条条修。
 */
@Component
public class CatalogConfigService {

    private final CategoryMapper categories;

    private final CategoryConfigMapper configs;

    public CatalogConfigService(CategoryMapper categories, CategoryConfigMapper configs) {
        this.categories = Objects.requireNonNull(categories, "categories");
        this.configs = Objects.requireNonNull(configs, "configs");
    }

    public List<CategoryTreeNode> tree() {
        return categories.tree();
    }

    /** 叶子的配置。分组类目没有配置，返回 404 而不是空对象——空对象会让调用方以为"配了但都是默认值"。 */
    public CategoryConfig config(UUID categoryId) {
        return configs.find(categoryId)
                .orElseThrow(() -> BusinessException.notFound("该类目没有配置（只有叶子类目有）: " + categoryId));
    }

    /**
     * 建类目。L1/L2 只建树节点，L3 同时建配置和属性模板。
     *
     * <p>层级由服务端算（父层级 + 1），不由调用方传——传 level 就能建出
     * "第 2 层但有配置"这种不可能的行。同理，"有没有 config" 决定是不是叶子：
     * 第 3 层必须有 config，第 1/2 层必须没有。这两条在下面显式校验。
     */
    @Transactional
    public UUID create(CreateCategoryRequest request) {
        UUID parentId = request.parentId();
        int level;
        String parentPath;

        if (parentId == null) {
            level = 1;
            parentPath = null;
        } else {
            CategoryEntity parent =
                    categories.find(parentId).orElseThrow(() -> BusinessException.notFound("父类目不存在: " + parentId));
            if (parent.getLevel() >= CategoryEntity.LEAF_LEVEL) {
                throw BusinessException.badRequest(ErrorCodes.CATEGORY_LEVEL_EXCEEDED, "类目最多三层，这个父类目已经是第三层");
            }
            level = parent.getLevel() + 1;
            parentPath = parent.getPath();
        }

        boolean leaf = level >= CategoryEntity.LEAF_LEVEL;
        if (leaf && request.config() == null) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "第三层是叶子类目，必须给配置（识别键与属性模板）");
        }
        if (!leaf && request.config() != null) {
            throw BusinessException.badRequest(
                    ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "前两层是分组类目，不接受配置——它们只描述分组，不描述商品要求");
        }

        if (categories.codeExists(request.code())) {
            throw BusinessException.conflict(ErrorCodes.CATEGORY_CODE_TAKEN, "类目编码已被占用: " + request.code());
        }

        UUID categoryId = Ids.newId();
        categories.insert(
                categoryId,
                parentId,
                CategoryMapper.pathOf(parentPath, categoryId),
                level,
                request.code(),
                request.name(),
                // 分组类目建好就能用（它没有配置要配）；叶子必须先配齐再 activate
                leaf ? CategoryStatus.DRAFT : CategoryStatus.ACTIVE,
                request.sortOrDefault());

        if (request.config() != null) {
            validateConfig(request.config());
            configs.insert(
                    categoryId,
                    request.config().identityKeys(),
                    request.config().skuIdentityKinds(),
                    nullToEmpty(request.config().matchStrategies()),
                    BrandPolicy.from(request.config().brandPolicy()),
                    nullToEmpty(request.config().qualificationCodes()),
                    request.config().autoApproveOrDefault());
            insertAttributes(categoryId, request.config().attributes());
        }
        return categoryId;
    }

    /**
     * 给叶子补属性模板。
     *
     * <p>属性只增不删：删属性会让存量商品的 {@code spu_attr} 悬空，而那些值没法自动还原。
     * 下线一个属性走 {@code status = disabled}。
     */
    @Transactional
    public void addAttributes(UUID categoryId, List<CreateCategoryRequest.AttributeRequest> attributes) {
        requireLeaf(categoryId);
        List<String> codes = attributes.stream()
                .map(CreateCategoryRequest.AttributeRequest::code)
                .toList();
        List<String> taken = configs.existingAttributeCodes(categoryId, codes);
        if (!taken.isEmpty()) {
            throw BusinessException.conflict(ErrorCodes.ATTRIBUTE_CODE_TAKEN, "属性编码已存在: " + taken);
        }
        for (CreateCategoryRequest.AttributeRequest attribute : attributes) {
            validateAttribute(attribute);
        }
        insertAttributes(categoryId, attributes);
    }

    /**
     * 转 active。
     *
     * <p>只对叶子有意义——分组类目建好就是 active。校验一条：参数哈希类目必须有识别属性。
     * 白牌非标类目（{@code identityKeys = {none}}）本来就没有识别属性，不该被卡住；
     * 而白牌标品要是没有识别属性，参数哈希是空串，所有商品归并成同一个。
     */
    @Transactional
    public void activate(UUID categoryId) {
        CategoryEntity category = requireLeaf(categoryId);
        CategoryConfig config = config(categoryId);

        if (config.identityKeys().contains(IdentityKind.PARAM_HASH.dbValue())
                && config.attributes().stream().noneMatch(CategoryConfig.AttributeView::identity)) {
            throw BusinessException.badRequest(
                    ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "类目声明了参数哈希识别，但没有任何识别属性: " + category.getCode());
        }

        requireAncestorsActive(category);
        if (!categories.updateStatus(categoryId, CategoryStatus.ACTIVE)) {
            throw BusinessException.conflict("类目状态刚被别的请求改过");
        }
    }

    /** 父链上任一不是 active，就不许启用。父链不可用，整支都不可用。 */
    private void requireAncestorsActive(CategoryEntity category) {
        for (UUID ancestorId : CategoryMapper.ancestorsOf(category.getPath(), category.getId())) {
            CategoryStatus status = categories
                    .find(ancestorId)
                    .map(CategoryEntity::getStatus)
                    .orElseThrow(() -> BusinessException.notFound("父类目不存在: " + ancestorId));
            if (status != CategoryStatus.ACTIVE) {
                throw BusinessException.badRequest(
                        ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "上级类目未启用（" + status.dbValue() + "），子类目不能单独启用");
            }
        }
    }

    @Transactional
    public void updateStatus(UUID categoryId, CategoryStatus target) {
        CategoryEntity category = requireCategory(categoryId);
        if (target == CategoryStatus.ACTIVE && category.leaf()) {
            activate(categoryId);
            return;
        }
        if (!categories.updateStatus(categoryId, target)) {
            throw BusinessException.conflict("类目状态刚被别的请求改过");
        }
    }

    @Transactional
    public void updateSort(UUID categoryId, int sort) {
        requireCategory(categoryId);
        if (!categories.updateSort(categoryId, sort)) {
            throw BusinessException.conflict("类目刚被别的请求改过");
        }
    }

    @Transactional
    public void rename(UUID categoryId, String name) {
        requireCategory(categoryId);
        if (!categories.updateName(categoryId, name)) {
            throw BusinessException.conflict("类目刚被别的请求改过");
        }
    }

    private CategoryEntity requireCategory(UUID categoryId) {
        return categories.find(categoryId).orElseThrow(() -> BusinessException.notFound("类目不存在: " + categoryId));
    }

    /** 配置只能挂在叶子上。库里有触发器兜底，这里先拦是为了给出能定位的码而不是 SQL 错误。 */
    private CategoryEntity requireLeaf(UUID categoryId) {
        CategoryEntity category =
                categories.find(categoryId).orElseThrow(() -> BusinessException.notFound("类目不存在: " + categoryId));
        if (!category.leaf()) {
            throw BusinessException.badRequest(
                    ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "只有叶子类目（第三层）有配置，这个类目是第 " + category.getLevel() + " 层");
        }
        return category;
    }

    private void insertAttributes(UUID categoryId, List<CreateCategoryRequest.AttributeRequest> attributes) {
        int sort = 0;
        for (CreateCategoryRequest.AttributeRequest attribute : attributes) {
            ValueType valueType = ValueType.from(attribute.valueType());
            configs.insertAttribute(
                    Ids.newId(),
                    categoryId,
                    attribute.code(),
                    attribute.name(),
                    valueType,
                    attribute.unit(),
                    optionsJson(valueType, attribute.options()),
                    attribute.salesSpecOrDefault(),
                    attribute.requiredOrDefault(),
                    attribute.identityOrDefault(),
                    attribute.filterableOrDefault(),
                    attribute.multiOrDefault(),
                    attribute.sortOrDefault() == 0 ? sort : attribute.sortOrDefault());
            sort += 10;
        }
    }

    /**
     * 三项校验，都是"库里能存、但业务上一定错"的组合。
     *
     * <p>放在 service 而不是只靠库约束：库约束拦得住，但报出来的是 SQL 错误，
     * 前端拿不到能定位到字段的码。
     */
    private void validateAttribute(CreateCategoryRequest.AttributeRequest attribute) {
        ValueType valueType = ValueType.from(attribute.valueType());
        if (attribute.identityOrDefault() && !valueType.canBeIdentity()) {
            throw BusinessException.badRequest(
                    ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN,
                    "识别属性必须是枚举或数字，" + attribute.code() + " 是 " + valueType.dbValue());
        }
        if (valueType == ValueType.ENUM
                && (attribute.options() == null || attribute.options().isEmpty())) {
            throw BusinessException.badRequest(
                    ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "枚举属性必须给值域: " + attribute.code());
        }
        if (valueType == ValueType.NUMBER
                && (attribute.unit() == null || attribute.unit().isBlank())) {
            throw BusinessException.badRequest(
                    ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "数字属性必须给单位: " + attribute.code());
        }
        if (valueType != ValueType.NUMBER
                && attribute.unit() != null
                && !attribute.unit().isBlank()) {
            throw BusinessException.badRequest(
                    ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "只有数字属性能有单位: " + attribute.code());
        }
    }

    /**
     * 识别键的合法性。
     *
     * <p>两条硬规则：GTIN 只能在 SKU 级（它是规格粒度的键，一个颜色容量组合一个条码）；
     * {@code none} 不能和其他值混用（"认不出来"和"认得出"是互斥的）。
     */
    private void validateConfig(CreateCategoryRequest.CategoryConfigRequest config) {
        List<String> identityKeys = config.identityKeys();
        if (identityKeys.contains("gtin")) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "GTIN 是 SKU 粒度的键，不能进 SPU 级识别键");
        }
        Set<String> keys = new HashSet<>(identityKeys);
        if (keys.contains(IdentityKind.NONE.dbValue()) && keys.size() > 1) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "none 不能和其他识别键并存");
        }
        for (String key : identityKeys) {
            IdentityKind.from(key);
        }
        for (String kind : config.skuIdentityKinds()) {
            if (!"gtin".equals(kind) && !"param_hash".equals(kind) && !"none".equals(kind)) {
                throw BusinessException.badRequest(ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "未知的 SKU 识别键: " + kind);
            }
        }
        BrandPolicy.from(config.brandPolicy());
        for (String strategy : nullToEmpty(config.matchStrategies())) {
            IdentityKind.from(strategy);
        }
        for (CreateCategoryRequest.AttributeRequest attribute : config.attributes()) {
            validateAttribute(attribute);
        }
    }

    private static String optionsJson(ValueType valueType, List<String> options) {
        if (valueType != ValueType.ENUM) {
            return null;
        }
        List<String> values = options == null ? List.of() : options;
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                json.append(',');
            }
            json.append('"')
                    .append(values.get(i).replace("\\", "\\\\").replace("\"", "\\\""))
                    .append('"');
        }
        return json.append(']').toString();
    }

    private static List<String> nullToEmpty(List<String> values) {
        return values == null ? new ArrayList<>() : values;
    }
}
