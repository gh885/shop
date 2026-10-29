package com.shop.platform.catalog.service;

import com.shop.platform.audit.api.AuditCommand;
import com.shop.platform.audit.api.AuditEntry;
import com.shop.platform.audit.api.FieldChange;
import com.shop.platform.catalog.dto.CategoryTreeNode;
import com.shop.platform.catalog.dto.CreateAttributeValueRequest;
import com.shop.platform.catalog.dto.CreateCategoryRequest;
import com.shop.platform.catalog.dto.UpdateAttributeValueRequest;
import com.shop.platform.catalog.dto.UpdateCategoryAttributeRequest;
import com.shop.platform.catalog.dto.UpdateCategoryConfigRequest;
import com.shop.platform.catalog.mapper.CategoryConfigMapper;
import com.shop.platform.catalog.mapper.CategoryMapper;
import com.shop.platform.catalog.mapper.CategoryRow;
import com.shop.platform.catalog.mapper.SpuMapper;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

    private final SpuMapper products;

    private final AuditCommand audit;

    public CatalogConfigService(
            CategoryMapper categories, CategoryConfigMapper configs, SpuMapper products, AuditCommand audit) {
        this.categories = Objects.requireNonNull(categories, "categories");
        this.configs = Objects.requireNonNull(configs, "configs");
        this.products = Objects.requireNonNull(products, "products");
        this.audit = Objects.requireNonNull(audit, "audit");
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
     * 改叶子的配置（属性模板之外的六项）。
     *
     * <p><b>识别键 / 匹配策略 / SKU 识别键在类目有商品之后锁死。</b> 改它们会让存量商品的
     * {@code match_key} 与 {@code sku.identity_key} 全部失效，而没有任何迁移能猜出
     * 「按新策略这个商品该挂到哪个标准品」。品牌策略、资质、免审可以随时改——它们只影响
     * 后续的发布闸门，不会改写已经算好的键。
     */
    @Transactional
    public void updateConfig(UUID categoryId, UpdateCategoryConfigRequest request, UUID operatorId) {
        requireLeaf(categoryId);
        CategoryConfig current = config(categoryId);
        validateConfigValues(
                request.identityKeys(), request.skuIdentityKinds(), request.matchStrategies(), request.brandPolicy());

        boolean spuIdentityChanged = !List.copyOf(request.identityKeys()).equals(current.identityKeys());
        if (spuIdentityChanged) {
            validateStoredTemplate(request.identityKeys(), current.attributes());
        }
        boolean identityChanged = spuIdentityChanged
                || !List.copyOf(nullToEmpty(request.matchStrategies())).equals(current.matchStrategies())
                || !new HashSet<>(request.skuIdentityKinds()).equals(new HashSet<>(current.skuIdentityKinds()));
        if (identityChanged && products.countMerchantSpusByCategory(categoryId) > 0) {
            throw BusinessException.conflict(
                    "CATEGORY_CONFIG_LOCKED", "类目下已有商品，识别键与匹配策略不能改——存量商品的 match_key / identity_key 会全部失效");
        }

        boolean updated = configs.update(
                categoryId,
                request.identityKeys(),
                request.skuIdentityKinds(),
                nullToEmpty(request.matchStrategies()),
                BrandPolicy.from(request.brandPolicy()),
                nullToEmpty(request.qualificationCodes()),
                request.autoApproveOrDefault());
        if (!updated) {
            throw BusinessException.notFound("类目配置不存在: " + categoryId);
        }
        Map<String, FieldChange> changes = new LinkedHashMap<>();
        changes.put("identityKeys", FieldChange.of(current.identityKeys(), request.identityKeys()));
        changes.put("skuIdentityKinds", FieldChange.of(current.skuIdentityKinds(), request.skuIdentityKinds()));
        changes.put(
                "matchStrategies", FieldChange.of(current.matchStrategies(), nullToEmpty(request.matchStrategies())));
        changes.put("brandPolicy", FieldChange.of(current.brandPolicy(), request.brandPolicy()));
        changes.put("autoApprove", FieldChange.of(current.autoApprove(), request.autoApproveOrDefault()));
        audit.record(AuditEntry.byStaff(
                "catalog.category.config_updated", "category", categoryId.toString(), operatorId, null, changes));
    }

    /**
     * 改属性模板的可编辑元数据。
     *
     * <p>属性只增不删，下线走 {@code status = disabled}，存量 {@code spu_attr} 保留。
     * {@code required} / {@code multi} / 结构属性的上下线会改变存量数据的解释方式，
     * 类目有商品之后锁死；改名、筛选、排序随时可改。
     */
    @Transactional
    public void updateAttribute(
            UUID categoryId, UUID attributeId, UpdateCategoryAttributeRequest request, UUID operatorId) {
        requireLeaf(categoryId);
        CategoryConfig current = config(categoryId);
        CategoryConfig.AttributeView existing = current.attributes().stream()
                .filter(attribute -> attribute.id().equals(attributeId))
                .findFirst()
                .orElseThrow(() -> BusinessException.notFound("属性不存在: " + attributeId));

        String status = request.status() == null ? existing.status() : request.status();
        if (!"active".equals(status) && !"disabled".equals(status)) {
            throw BusinessException.badRequest("属性状态只能是 active / disabled: " + status);
        }
        String name = request.name() == null ? existing.name() : request.name();
        if (name.isBlank()) {
            throw BusinessException.badRequest("属性名称不能为空");
        }
        boolean required = request.required() == null ? existing.required() : request.required();
        boolean filterable = request.filterable() == null ? existing.filterable() : request.filterable();
        boolean multi = request.multi() == null ? existing.multi() : request.multi();
        boolean allowCustom = request.allowCustom() == null ? existing.allowCustom() : request.allowCustom();
        int sort = request.sort() == null ? existing.sort() : request.sort();
        CategoryConfig.VisibleWhen visibleWhen = request.visibleWhen() == null
                ? existing.visibleWhen()
                : new CategoryConfig.VisibleWhen(
                        request.visibleWhen().attributeId(),
                        request.visibleWhen().operator(),
                        List.copyOf(request.visibleWhen().values()));
        validateVisibleWhen(current, attributeId, visibleWhen);

        if (existing.salesSpec() && multi && !existing.multi()) {
            throw BusinessException.badRequest(
                    ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "规格属性不能改成多值: " + existing.code());
        }
        if (allowCustom && ValueType.from(existing.valueType()) != ValueType.ENUM) {
            throw BusinessException.badRequest("只有枚举属性能允许商家自定义值: " + existing.code());
        }

        boolean changingRequired = required != existing.required();
        boolean changingMulti = multi != existing.multi();
        boolean changingStructuralStatus = !status.equals(existing.status())
                && (existing.identity() || existing.salesSpec() || existing.required());
        if (products.countMerchantSpusByCategory(categoryId) > 0
                && (changingRequired || changingMulti || changingStructuralStatus)) {
            throw BusinessException.conflict(
                    "CATEGORY_CONFIG_LOCKED", "类目下已有商品，必填 / 多选 / 结构属性的上下线不能改: " + existing.code());
        }

        List<CategoryConfig.AttributeView> updated = current.attributes().stream()
                .map(attribute -> attribute.id().equals(attributeId)
                        ? new CategoryConfig.AttributeView(
                                attribute.id(),
                                attribute.code(),
                                name,
                                attribute.valueType(),
                                attribute.unit(),
                                attribute.options(),
                                attribute.values(),
                                allowCustom,
                                attribute.salesSpec(),
                                required,
                                attribute.identity(),
                                filterable,
                                multi,
                                status,
                                sort,
                                visibleWhen)
                        : attribute)
                .toList();
        // 只有真正动了模板语义才复验；改名 / 筛选 / 排序不该被历史模板的旧约束挡住
        boolean templateChanged = changingRequired
                || changingMulti
                || (!status.equals(existing.status()) && (existing.identity() || existing.salesSpec() || required));
        if (templateChanged) {
            validateStoredTemplate(current.identityKeys(), updated);
        }

        if (configs.updateAttribute(
                        categoryId,
                        attributeId,
                        name,
                        required,
                        filterable,
                        multi,
                        allowCustom,
                        status,
                        sort,
                        visibleWhen == null ? null : com.shop.platform.infra.db.JsonColumns.write(visibleWhen))
                == 0) {
            throw BusinessException.notFound("属性不存在: " + attributeId);
        }
        Map<String, FieldChange> changes = new LinkedHashMap<>();
        changes.put("name", FieldChange.of(existing.name(), name));
        changes.put("required", FieldChange.of(existing.required(), required));
        changes.put("filterable", FieldChange.of(existing.filterable(), filterable));
        changes.put("multi", FieldChange.of(existing.multi(), multi));
        changes.put("allowCustom", FieldChange.of(existing.allowCustom(), allowCustom));
        changes.put("status", FieldChange.of(existing.status(), status));
        changes.put("sort", FieldChange.of(existing.sort(), sort));
        changes.put("visibleWhen", FieldChange.of(existing.visibleWhen(), visibleWhen));
        audit.record(AuditEntry.byStaff(
                "catalog.category.attribute_updated", "attribute", attributeId.toString(), operatorId, null, changes));
    }

    /**
     * 建类目。L1/L2 只建树节点，L3 同时建配置和属性模板。
     *
     * <p>层级由服务端算（父层级 + 1），不由调用方传——传 level 就能建出
     * "第 2 层但有配置"这种不可能的行。同理，"有没有 config" 决定是不是叶子：
     * 第 3 层必须有 config，第 1/2 层必须没有。这两条在下面显式校验。
     */
    @Transactional
    public UUID create(CreateCategoryRequest request, UUID operatorId) {
        UUID parentId = request.parentId();
        int level;
        String parentPath;

        if (parentId == null) {
            level = 1;
            parentPath = null;
        } else {
            CategoryRow parent =
                    categories.find(parentId).orElseThrow(() -> BusinessException.notFound("父类目不存在: " + parentId));
            if (parent.level() >= CategoryRow.LEAF_LEVEL) {
                throw BusinessException.badRequest(ErrorCodes.CATEGORY_LEVEL_EXCEEDED, "类目最多三层，这个父类目已经是第三层");
            }
            level = parent.level() + 1;
            parentPath = parent.path();
        }

        boolean leaf = level >= CategoryRow.LEAF_LEVEL;
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
        audit.record(AuditEntry.byStaff(
                "catalog.category.created",
                "category",
                categoryId.toString(),
                operatorId,
                null,
                Map.of(
                        "code", FieldChange.to(request.code()),
                        "name", FieldChange.to(request.name()),
                        "level", FieldChange.to(level))));
        return categoryId;
    }

    /**
     * 给叶子补属性模板。
     *
     * <p>属性只增不删：删属性会让存量商品的 {@code spu_attr} 悬空，而那些值没法自动还原。
     * 下线一个属性走 {@code status = disabled}。
     */
    @Transactional
    public void addAttributes(
            UUID categoryId, List<CreateCategoryRequest.AttributeRequest> attributes, UUID operatorId) {
        if (attributes == null || attributes.isEmpty()) {
            throw BusinessException.badRequest("至少要给一个属性");
        }
        requireLeaf(categoryId);
        CategoryConfig current = config(categoryId);
        Set<String> uniqueCodes = new HashSet<>();
        for (CreateCategoryRequest.AttributeRequest attribute : attributes) {
            if (!uniqueCodes.add(attribute.code())) {
                throw BusinessException.conflict(ErrorCodes.ATTRIBUTE_CODE_TAKEN, "同一个请求里属性编码重复: " + attribute.code());
            }
        }
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

        // 识别属性改哈希、规格属性改 SKU 维度、必填属性改提交闸门——这三类在商品进来之后
        // 都会让存量数据对不上模板。加可选的非规格属性随便加，剩下三类锁死。
        boolean changesTemplate = attributes.stream()
                .anyMatch(attribute -> attribute.identityOrDefault()
                        || attribute.salesSpecOrDefault()
                        || attribute.requiredOrDefault());
        if (changesTemplate && products.countMerchantSpusByCategory(categoryId) > 0) {
            throw BusinessException.conflict(
                    "CATEGORY_CONFIG_LOCKED", "类目下已有商品，不能再增加识别 / 规格 / 必填属性；要加请先清空该类目商品，或改成可选属性");
        }
        // 参数哈希类目的识别属性必须必填：漏填一项会拼出短哈希，把不同商品误并成同款
        if (current.identityKeys().contains(IdentityKind.PARAM_HASH.dbValue())) {
            for (CreateCategoryRequest.AttributeRequest attribute : attributes) {
                if (attribute.identityOrDefault() && !attribute.requiredOrDefault()) {
                    throw BusinessException.badRequest(
                            ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "参数哈希类目的识别属性必须必填: " + attribute.code());
                }
            }
        }
        insertAttributes(categoryId, attributes);
        audit.record(AuditEntry.byStaff(
                "catalog.category.attribute_added",
                "category",
                categoryId.toString(),
                operatorId,
                null,
                Map.of(
                        "codes",
                        FieldChange.to(attributes.stream()
                                .map(CreateCategoryRequest.AttributeRequest::code)
                                .toList()))));
    }

    /**
     * 转 active。
     *
     * <p>只对叶子有意义——分组类目建好就是 active。校验一条：参数哈希类目必须有识别属性。
     * 白牌非标类目（{@code identityKeys = {none}}）本来就没有识别属性，不该被卡住；
     * 而白牌标品要是没有识别属性，参数哈希是空串，所有商品归并成同一个。
     */
    @Transactional
    public void activate(UUID categoryId, UUID operatorId) {
        activateInternal(categoryId);
        audit.record(AuditEntry.byStaff(
                "catalog.category.status_changed",
                "category",
                categoryId.toString(),
                operatorId,
                null,
                Map.of("status", FieldChange.to(CategoryStatus.ACTIVE.dbValue()))));
    }

    private void activateInternal(UUID categoryId) {
        CategoryRow category = requireLeaf(categoryId);
        CategoryConfig config = config(categoryId);
        validateStoredTemplate(config.identityKeys(), config.attributes());

        requireAncestorsActive(category);
        if (!categories.updateStatus(categoryId, CategoryStatus.ACTIVE)) {
            throw BusinessException.conflict("类目状态刚被别的请求改过");
        }
    }

    /** 父链上任一不是 active，就不许启用。父链不可用，整支都不可用。 */
    private void requireAncestorsActive(CategoryRow category) {
        for (UUID ancestorId : CategoryMapper.ancestorsOf(category.path(), category.id())) {
            CategoryStatus status = categories
                    .find(ancestorId)
                    .map(CategoryRow::status)
                    .orElseThrow(() -> BusinessException.notFound("父类目不存在: " + ancestorId));
            if (status != CategoryStatus.ACTIVE) {
                throw BusinessException.badRequest(
                        ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "上级类目未启用（" + status.dbValue() + "），子类目不能单独启用");
            }
        }
    }

    @Transactional
    public void updateStatus(UUID categoryId, CategoryStatus target, UUID operatorId) {
        CategoryRow category = requireCategory(categoryId);
        if (target == CategoryStatus.ACTIVE && category.leaf()) {
            activateInternal(categoryId);
        } else if (!categories.updateStatus(categoryId, target)) {
            throw BusinessException.conflict("类目状态刚被别的请求改过");
        }
        audit.record(AuditEntry.byStaff(
                "catalog.category.status_changed",
                "category",
                categoryId.toString(),
                operatorId,
                null,
                Map.of("status", FieldChange.of(category.status().dbValue(), target.dbValue()))));
    }

    @Transactional
    public void updateSort(UUID categoryId, int sort, UUID operatorId) {
        CategoryRow category = requireCategory(categoryId);
        if (!categories.updateSort(categoryId, sort)) {
            throw BusinessException.conflict("类目刚被别的请求改过");
        }
        audit.record(AuditEntry.byStaff(
                "catalog.category.sorted",
                "category",
                categoryId.toString(),
                operatorId,
                null,
                Map.of("sort", FieldChange.of(category.sort(), sort))));
    }

    @Transactional
    public void rename(UUID categoryId, String name, UUID operatorId) {
        CategoryRow category = requireCategory(categoryId);
        if (!categories.updateName(categoryId, name)) {
            throw BusinessException.conflict("类目刚被别的请求改过");
        }
        audit.record(AuditEntry.byStaff(
                "catalog.category.renamed",
                "category",
                categoryId.toString(),
                operatorId,
                null,
                Map.of("name", FieldChange.of(category.name(), name))));
    }

    /**
     * 追加一个平台值。值文本创建后不改名——它进 {@code spec_key} / 参数哈希，
     * 改名等于把存量商品换成另一个规格。
     */
    @Transactional
    public UUID addValue(UUID categoryId, UUID attributeId, CreateAttributeValueRequest request, UUID operatorId) {
        requireLeaf(categoryId);
        CategoryConfig.AttributeView attribute = requireAttribute(categoryId, attributeId);
        if (ValueType.from(attribute.valueType()) != ValueType.ENUM) {
            throw BusinessException.badRequest("只有枚举属性能维护值域: " + attribute.code());
        }
        String value = request.value().trim();
        boolean duplicated = attribute.values().stream()
                .anyMatch(existing -> existing.value().equalsIgnoreCase(value));
        if (duplicated) {
            throw BusinessException.conflict("属性值已存在: " + value);
        }
        UUID valueId = Ids.newId();
        configs.insertValue(valueId, attributeId, value, request.imageUrl(), request.sortOrDefault(), "platform");
        audit.record(AuditEntry.byStaff(
                "catalog.category.value_created",
                "attribute_value",
                valueId.toString(),
                operatorId,
                null,
                Map.of(
                        "attributeId", FieldChange.to(attributeId),
                        "value", FieldChange.to(value))));
        return valueId;
    }

    /** 只改图片 / 排序 / 启停；值文本不可改。停用不会抹掉存量商品已经用的值。 */
    @Transactional
    public void updateValue(
            UUID categoryId, UUID attributeId, UUID valueId, UpdateAttributeValueRequest request, UUID operatorId) {
        requireLeaf(categoryId);
        requireAttribute(categoryId, attributeId);
        CategoryConfigMapper.ValueRow existing = configs.findValue(attributeId, valueId)
                .orElseThrow(() -> BusinessException.notFound("属性值不存在: " + valueId));
        String status = request.status() == null ? existing.status() : request.status();
        if (!"active".equals(status) && !"disabled".equals(status)) {
            throw BusinessException.badRequest("属性值状态只能是 active / disabled: " + status);
        }
        int sort = request.sort() == null ? existing.sort() : request.sort();
        if (configs.updateValue(attributeId, valueId, request.imageUrl(), sort, status) == 0) {
            throw BusinessException.notFound("属性值不存在: " + valueId);
        }
        Map<String, FieldChange> changes = new LinkedHashMap<>();
        changes.put(
                "imageUrl",
                FieldChange.of(
                        existing.imageUrl() == null ? "" : existing.imageUrl(),
                        request.imageUrl() == null ? "" : request.imageUrl()));
        changes.put("sort", FieldChange.of(existing.sort(), sort));
        changes.put("status", FieldChange.of(existing.status(), status));
        audit.record(AuditEntry.byStaff(
                "catalog.category.value_updated", "attribute_value", valueId.toString(), operatorId, null, changes));
    }

    private CategoryConfig.AttributeView requireAttribute(UUID categoryId, UUID attributeId) {
        return config(categoryId).attributes().stream()
                .filter(attribute -> attribute.id().equals(attributeId))
                .findFirst()
                .orElseThrow(() -> BusinessException.notFound("属性不存在: " + attributeId));
    }

    private CategoryRow requireCategory(UUID categoryId) {
        return categories.find(categoryId).orElseThrow(() -> BusinessException.notFound("类目不存在: " + categoryId));
    }

    /** 配置只能挂在叶子上。库里有触发器兜底，这里先拦是为了给出能定位的码而不是 SQL 错误。 */
    private CategoryRow requireLeaf(UUID categoryId) {
        CategoryRow category =
                categories.find(categoryId).orElseThrow(() -> BusinessException.notFound("类目不存在: " + categoryId));
        if (!category.leaf()) {
            throw BusinessException.badRequest(
                    ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "只有叶子类目（第三层）有配置，这个类目是第 " + category.level() + " 层");
        }
        return category;
    }

    /**
     * 条件可见规则只允许单层：被依赖属性不能再有规则，否则要拓扑排序并处理环。
     * 销售规格属性不做依赖源——SKU 维度随商品属性变会让矩阵语义失控。
     */
    private static void validateVisibleWhen(CategoryConfig current, UUID selfId, CategoryConfig.VisibleWhen rule) {
        if (rule == null) {
            return;
        }
        if (!java.util.Set.of("eq", "neq", "in").contains(rule.operator())) {
            throw BusinessException.badRequest("条件可见的 operator 只能是 eq / neq / in: " + rule.operator());
        }
        if (rule.values() == null || rule.values().isEmpty()) {
            throw BusinessException.badRequest("条件可见必须至少给一个值");
        }
        CategoryConfig.AttributeView dependency = current.attributes().stream()
                .filter(attribute -> attribute.id().equals(rule.attributeId()))
                .findFirst()
                .orElseThrow(() -> BusinessException.badRequest("条件可见依赖的属性不存在: " + rule.attributeId()));
        if (dependency.id().equals(selfId)) {
            throw BusinessException.badRequest("属性不能依赖自己: " + dependency.code());
        }
        if (dependency.visibleWhen() != null) {
            throw BusinessException.badRequest("条件可见只支持单层依赖，被依赖属性不能再有规则: " + dependency.code());
        }
        if (dependency.salesSpec()) {
            throw BusinessException.badRequest("销售规格属性不能作为条件可见的依赖: " + dependency.code());
        }
    }

    private void insertAttributes(UUID categoryId, List<CreateCategoryRequest.AttributeRequest> attributes) {
        int sort = 0;
        for (CreateCategoryRequest.AttributeRequest attribute : attributes) {
            ValueType valueType = ValueType.from(attribute.valueType());
            UUID attributeId = Ids.newId();
            configs.insertAttribute(
                    attributeId,
                    categoryId,
                    attribute.code(),
                    attribute.name(),
                    valueType,
                    attribute.unit(),
                    attribute.allowCustomOrDefault(),
                    attribute.salesSpecOrDefault(),
                    attribute.requiredOrDefault(),
                    attribute.identityOrDefault(),
                    attribute.filterableOrDefault(),
                    attribute.multiOrDefault(),
                    attribute.sortOrDefault() == 0 ? sort : attribute.sortOrDefault(),
                    visibleWhenJson(attribute.visibleWhen()));
            insertValues(attributeId, attribute.options(), "platform");
            sort += 10;
        }
    }

    private static String visibleWhenJson(CreateCategoryRequest.VisibleWhenRequest visibleWhen) {
        return visibleWhen == null
                ? null
                : com.shop.platform.infra.db.JsonColumns.write(new CategoryConfig.VisibleWhen(
                        visibleWhen.attributeId(), visibleWhen.operator(), List.copyOf(visibleWhen.values())));
    }

    private void insertValues(UUID attributeId, List<String> values, String source) {
        if (values == null || values.isEmpty()) {
            return;
        }
        int sort = 0;
        Set<String> seen = new HashSet<>();
        for (String value : values) {
            if (value == null || value.isBlank()) {
                throw BusinessException.badRequest(ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "属性值不能为空");
            }
            if (!seen.add(value.toLowerCase(java.util.Locale.ROOT))) {
                throw BusinessException.conflict("同一个属性下值重复: " + value);
            }
            configs.insertValue(Ids.newId(), attributeId, value, null, sort++, source);
        }
    }

    /**
     * 属性模板的校验。放在 service 而不是只靠库约束：库约束拦得住，但报出来的是 SQL 错误，
     * 前端拿不到能定位到字段的码。
     */
    private void validateAttributes(List<CreateCategoryRequest.AttributeRequest> attributes) {
        Set<String> codes = new HashSet<>();
        for (CreateCategoryRequest.AttributeRequest attribute : attributes) {
            if (!codes.add(attribute.code())) {
                throw BusinessException.conflict(ErrorCodes.ATTRIBUTE_CODE_TAKEN, "属性编码重复: " + attribute.code());
            }
            validateAttribute(attribute);
        }
    }

    private void validateAttribute(CreateCategoryRequest.AttributeRequest attribute) {
        ValueType valueType = ValueType.from(attribute.valueType());
        if (attribute.identityOrDefault() && !valueType.canBeIdentity()) {
            throw BusinessException.badRequest(
                    ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN,
                    "识别属性必须是枚举或数字，" + attribute.code() + " 是 " + valueType.dbValue());
        }
        if (valueType == ValueType.ENUM
                && (attribute.options() == null || attribute.options().isEmpty())
                && !attribute.allowCustomOrDefault()) {
            throw BusinessException.badRequest(
                    ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "枚举属性必须给值域（或允许商家自定义值）: " + attribute.code());
        }
        if (valueType != ValueType.ENUM
                && attribute.options() != null
                && !attribute.options().isEmpty()) {
            throw BusinessException.badRequest(
                    ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "只有枚举属性能给值域: " + attribute.code());
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
        // 规格维度是 SKU 的一个坐标，必须单值。多选的「颜色」没法拼 spec_key。
        if (attribute.salesSpecOrDefault() && attribute.multiOrDefault()) {
            throw BusinessException.badRequest(
                    ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "规格属性不能是多值: " + attribute.code());
        }
    }

    /**
     * 识别键的合法性。
     *
     * <p>硬规则：GTIN 只能在 SKU 级（一个颜色容量组合一个条码）；{@code none} 不能和其他值混用；
     * 匹配策略必须是识别键的子集——否则运营配了一个永远不会被试用的优先级。
     */
    private void validateConfigValues(
            List<String> identityKeys,
            List<String> skuIdentityKinds,
            List<String> matchStrategies,
            String brandPolicy) {
        if (identityKeys == null || identityKeys.isEmpty()) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "SPU 识别键不能为空");
        }
        if (skuIdentityKinds == null || skuIdentityKinds.isEmpty()) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "SKU 识别键不能为空");
        }
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

        Set<String> skuKinds = new HashSet<>(skuIdentityKinds);
        for (String kind : skuIdentityKinds) {
            if (!"gtin".equals(kind) && !"param_hash".equals(kind) && !"none".equals(kind)) {
                throw BusinessException.badRequest(ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "未知的 SKU 识别键: " + kind);
            }
        }
        if (skuKinds.contains(IdentityKind.NONE.dbValue()) && skuKinds.size() > 1) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "SKU 级 none 不能和其他识别键并存");
        }

        if (brandPolicy == null) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "品牌策略不能为空");
        }
        BrandPolicy.from(brandPolicy);
        for (String strategy : nullToEmpty(matchStrategies)) {
            IdentityKind.from(strategy);
            if (!keys.contains(strategy)) {
                throw BusinessException.badRequest(ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "匹配策略必须是识别键的子集: " + strategy);
            }
        }
    }

    private void validateConfig(CreateCategoryRequest.CategoryConfigRequest config) {
        validateConfigValues(
                config.identityKeys(), config.skuIdentityKinds(), config.matchStrategies(), config.brandPolicy());
        validateAttributes(config.attributes());
        validateNewTemplate(config.identityKeys(), config.attributes());
    }

    /** 新建模板：参数哈希类目的识别属性必须齐全且必填。单规格类目可以没有 sales-spec 属性。 */
    private void validateNewTemplate(
            List<String> identityKeys, List<CreateCategoryRequest.AttributeRequest> attributes) {
        if (!identityKeys.contains(IdentityKind.PARAM_HASH.dbValue())) {
            return;
        }
        List<CreateCategoryRequest.AttributeRequest> identityAttributes = attributes.stream()
                .filter(CreateCategoryRequest.AttributeRequest::identityOrDefault)
                .toList();
        if (identityAttributes.isEmpty()) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "类目声明了参数哈希识别，但没有任何识别属性");
        }
        for (CreateCategoryRequest.AttributeRequest attribute : identityAttributes) {
            if (!attribute.requiredOrDefault()) {
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "参数哈希类目的识别属性必须必填: " + attribute.code());
            }
        }
    }

    /** 存量模板的复验：激活、改配置、属性上下线之后都走这里。 */
    private void validateStoredTemplate(List<String> identityKeys, List<CategoryConfig.AttributeView> attributes) {
        if (!identityKeys.contains(IdentityKind.PARAM_HASH.dbValue())) {
            return;
        }
        List<CategoryConfig.AttributeView> identityAttributes = attributes.stream()
                .filter(attribute -> attribute.identity() && "active".equals(attribute.status()))
                .toList();
        if (identityAttributes.isEmpty()) {
            throw BusinessException.badRequest(ErrorCodes.CATEGORY_CONFIG_INCOMPLETE, "类目声明了参数哈希识别，但没有任何识别属性");
        }
        for (CategoryConfig.AttributeView attribute : identityAttributes) {
            if (!attribute.required()) {
                throw BusinessException.badRequest(
                        ErrorCodes.IDENTITY_ATTRIBUTE_NEEDS_DOMAIN, "参数哈希类目的识别属性必须必填: " + attribute.code());
            }
        }
    }

    private static List<String> nullToEmpty(List<String> values) {
        return values == null ? new ArrayList<>() : values;
    }
}
