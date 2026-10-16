package com.shop.platform.product.service;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.dto.SkuUpdateItem;
import com.shop.platform.product.mapper.CategoryAttr;
import com.shop.platform.product.mapper.CategoryAttrMapper;
import com.shop.platform.product.mapper.CategoryAttrValue;
import com.shop.platform.product.mapper.CategoryAttrValueMapper;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SkuMapper;
import com.shop.platform.product.model.AttrKind;
import com.shop.platform.product.model.SkuAttr;
import com.shop.platform.product.model.SkuStatus;
import com.shop.platform.product.model.SpecItem;
import com.shop.platform.product.model.SpecValue;
import java.time.OffsetDateTime;
import java.util.ArrayList;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 规格与 SKU：按类目属性模板提交规格选择并按 spec_key 对账 SKU、批量改价改量、SPU 改名后刷 SKU 名快照。
 *
 * <p>SPU 状态机与发布门槛在 {@link ProductService}；组合生成（笛卡尔积 / spec_key / 显示名公式）是实体自己说得出口的话，
 * 收在 {@link Product#specCombinations()} 与 {@link Sku#specKeyOf} / {@link Sku#nameOf}，本类只做编排与持久化。
 */
@Service
@RequiredArgsConstructor
public class SkuService {

    /** 单商品 SKU 组合数上限（笛卡尔积总量校验） */
    private static final int MAX_SKU_COMBINATIONS = 500;

    private final ProductMapper productMapper;
    private final SkuMapper skuMapper;
    private final CategoryAttrMapper attrMapper;
    private final CategoryAttrValueMapper attrValueMapper;
    private final CategoryAttrService categoryAttrService;
    private final StockCommand stockCommand;
    private final StockReadQuery stockReadQuery;

    /**
     * 按类目属性模板提交规格选择，并按 valueId 组合（spec_key）对账 SKU：
     * 组合没变的保留（价格库存不丢）、组合消失的停用保留（不物理删，见步骤 6）、组合新增的按笛卡尔积生成。
     *
     * <p>规格值 ID 化后，规格值改名只是改快照，不再被视为新组合—— 消除了旧版"改名即丢价"的已知限制。spec_key = valueId
     * 按模板维度顺序 ':' join，uk_skus_product_spec_key 唯一索引兜底重复组合。
     *
     * <p>仅非上架状态可改规格（守卫在实体）：改规格必须先下架——
     * 对账停用而不是删除被移除组合，避免买家购物车/订单里裸引用（无 FK）的 sku 行悬空。
     */
    @Transactional
    public List<Sku> updateSpecs(UUID shopId, UUID productId, List<SpecSelection> selections) {
        // 1. 归属 + 规格可编辑性守卫（上架冻结规格，要改先下架）
        Product product = productMapper.requireShopOwned(shopId, productId);
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
        List<List<SpecValue>> combos = product.specCombinations();
        Validate.isTrue(combos.size() <= MAX_SKU_COMBINATIONS, "规格组合数过多（" + combos.size() + "），请精简规格后重试");

        // 5. 对账改按 spec_key：组合没变的保留（改名不再产生新组合，价格库存不丢），保留的顺带刷新 attributes/name 快照
        Map<String, Sku> bySpecKey = new LinkedHashMap<>();
        for (Sku sku : skuMapper.selectByProductId(productId)) {
            bySpecKey.put(sku.getSpecKey(), sku);
        }

        List<Sku> result = new ArrayList<>();
        for (List<SpecValue> combo : combos) {
            String specKey = Sku.specKeyOf(combo);
            List<SkuAttr> attrs = buildAttributes(specs, combo);
            String name =
                    Sku.nameOf(product, combo.stream().map(SpecValue::value).toList());
            Sku kept = bySpecKey.remove(specKey);
            if (kept != null) {
                kept.setAttributes(attrs);
                kept.setName(name);
                skuMapper.updateById(kept);
                result.add(kept);
            } else {
                Sku fresh = Sku.builder()
                        .productId(productId)
                        .attributes(attrs)
                        .specKey(specKey)
                        .name(name)
                        .status(SkuStatus.ON_SALE)
                        .build();
                skuMapper.insert(fresh);
                // 库存主体行随 SKU 诞生（stock=0），卖家随后经 updateSkus 设总量
                stockCommand.ensureRow(fresh.getId());
                result.add(fresh);
            }
        }

        // 6. 组合消失的旧 SKU 停用保留（对齐"SKU 是经营资产不物理删"）：只置 DISABLED，库存主体行原样保留——
        //    在途订单的冻结/释放需要行存在（removeRow 会拦 frozen>0），且卖家重新选回组合时行、价格、库存都还在，可直接复售；
        //    物理删除只留给 abandon（草稿：无买家引用，同事务清 SKU + 库存行）。停用 SKU 不进买家可见集合（publicDetail 只返在售）。
        for (Sku removed : bySpecKey.values()) {
            if (removed.isOnSale()) {
                removed.setStatus(SkuStatus.DISABLED);
                skuMapper.updateById(removed);
            }
        }

        // 7. 重算价格区间：SPU 与 SKU 都在手上，直接回填免重查
        product.applyPriceRange(result);
        productMapper.updateById(product);
        return result;
    }

    /** 批量更新 SKU。任何状态都允许：上架后补货/改价/停用是日常运营操作。price 必填，其余只 set 非空字段。
     *  库存归 inventory 模块：seller 传的 stock 是「绝对量设定」，经 inventory :: StockCommand.setTotal 走乐观锁，不写 product 表。
     *  两条额外守卫：上架商品不允许被存成「全部在售 SKU 库存 = 0」（整链接无货必须先下架）；
     *  划线价（本次提交或存量）不允许低于本次提交的现价（DB CHECK 兜底，这里给 400 不冒 500）。 */
    @Transactional
    public List<Sku> updateSkus(UUID shopId, UUID productId, List<SkuUpdateItem> items) {
        // 1. 商品必须存在且属于当前店铺（任何状态都允许改价/补货，是日常运营操作）；实体留作价格区间回填
        Product product = productMapper.requireShopOwned(shopId, productId);
        // 1.5 上架商品：预检本次更新后仍须至少一个在售 SKU 有货（对齐「架上商品不能全 0」，改 0 需先下架）
        if (product.isPublished()) {
            ensureNotAllOutOfStock(productId, items);
        }

        // 1.8 划线价闸门：本次更新后每行仍须满足 original_price >= price（DB CHECK ck_skus_original_price_ge_price
        //     是最后防线，但撞上去冒 500；这里把「本次提交的现价」与「本次划线价，未提交则比存量划线价」放在一起先判，友好 400）
        Map<UUID, Sku> existingById = skuMapper.selectByProductId(productId).stream()
                .collect(Collectors.toMap(Sku::getId, Function.identity()));
        for (SkuUpdateItem item : items) {
            ensureStrikethroughNotInverted(existingById.get(item.skuId()), item);
        }

        // 2. 逐条更新：SKU 归属与「给了才改」的开关都写在那条语句里（见 SkuMapper.updateByProductAndId）
        // uk_skus_code 全局唯一索引兜底重复业务编码
        DuplicateKeys.conflictOnDuplicate(
                () -> {
                    for (SkuUpdateItem item : items) {
                        Long originalFen = item.originalPrice() == null
                                ? null
                                : item.originalPrice().amount();
                        int affected = skuMapper.updateByProductAndId(
                                productId,
                                item.skuId(),
                                item.name(),
                                item.image(),
                                originalFen,
                                item.skuCode(),
                                item.status(),
                                item.price().amount(),
                                item.price().currency());
                        Validate.isTrue(affected == 1, "SKU 不存在或不属于该商品");
                        // 3. 库存绝对量设定（读-改-写，乐观锁）：同一事务内同步调用 inventory :: api
                        stockCommand.setTotal(item.skuId(), item.stock());
                    }
                },
                "SKU 编码已存在");

        // 4. 重算价格区间并返回该商品全部 SKU：一次查出，出参与区间同源
        List<Sku> all = skuMapper.selectByProductId(productId);
        product.applyPriceRange(all);
        productMapper.updateById(product);
        return all;
    }

    /**
     * SKU 名是「SPU名 + 规格值」的快照：SPU 改名后对存量 SKU 重拼名字（规格值来自 SkuAttr 快照，
     * 只重拼 name 字符串，不动 spec_key / 价格 / 库存）。购物车实时读 SKU 名故随之一致；
     * 订单在成单时定格 name 快照，改名不回改已成的单。
     */
    public void refreshNames(Product product) {
        for (Sku sku : skuMapper.selectByProductId(product.getId())) {
            List<String> values = sku.getAttributes() == null
                    ? List.of()
                    : sku.getAttributes().stream().map(SkuAttr::value).toList();
            sku.setName(Sku.nameOf(product, values));
            skuMapper.updateById(sku);
        }
    }

    // 私有：规格选择解析
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
            Validate.isTrue(!values.isEmpty(), ErrorCodes.SPEC_SELECTION_EMPTY, "每个规格至少选择一个值");
            specs.add(new SpecItem(attr.getId(), attr.getName(), values));
        }
        return specs;
    }

    /**
     * 规格值的默认图落到 category_attr_values.image（仅在值变化时写，避免无谓更新）。
     *
     * <p>只写 image 一列（{@code updateImage} 条件更新），不走 {@code updateById}：这张表还有管理员改名在写，
     * 整行回写会把读到的旧 value 写回、把并发的改名静默撤销。
     */
    private void persistValueImage(CategoryAttrValue row, String image) {
        if (image == null) return;
        if (Objects.equals(row.getImage(), image)) return;
        row.setImage(image);
        attrValueMapper.updateImage(row.getId(), image, OffsetDateTime.now());
    }

    /** 批量按主键取行 → id → 实体 Map；空集合不发查询（空 IN 列表在 MP 下会退化成全表扫） */
    private static <T> Map<UUID, T> byId(BaseMapper<T> mapper, List<UUID> ids, Function<T, UUID> idOf) {
        Set<UUID> distinct = ids.stream().filter(Objects::nonNull).collect(Collectors.toSet());
        if (distinct.isEmpty()) {
            return Map.of();
        }
        return mapper.selectByIds(distinct).stream().collect(Collectors.toMap(idOf, Function.identity()));
    }

    /** 按模板顺序组装 SKU 规格取值快照：attrId/valueId 是身份，name/value 从模板读出 */
    private static List<SkuAttr> buildAttributes(List<SpecItem> specs, List<SpecValue> combo) {
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

    /** 划线价闸门：更新后的终值划线价（本次提交值；传 null 不改则比存量划线价）不得低于本次提交的现价。
     *  SKU 不存在 / 不属于该商品时放行——由步骤 2 的 affected 判定报「SKU 不存在或不属于该商品」，不在此抢跑。 */
    private static void ensureStrikethroughNotInverted(Sku current, SkuUpdateItem item) {
        Long submittedStrikethrough = item.originalPrice() == null
                ? null
                : Long.valueOf(item.originalPrice().amount());
        Long existingStrikethrough = current == null ? null : current.getOriginalPrice();
        Long finalStrikethrough = submittedStrikethrough != null ? submittedStrikethrough : existingStrikethrough;
        Validate.isTrue(
                finalStrikethrough == null || finalStrikethrough >= item.price().amount(), "划线价不能低于现价，请调整后再保存");
    }

    /** 上架商品不允许被存成「全部在售 SKU 库存 = 0」（对齐淘宝 API：最后一个 SKU 改 0 需先下架）。
     *  SKU 级停用/单行售罄仍允许（日常运营）；整链接无货必须先下架再处理。 */
    private void ensureNotAllOutOfStock(UUID productId, List<SkuUpdateItem> items) {
        Map<UUID, SkuUpdateItem> byId = items.stream().collect(Collectors.toMap(SkuUpdateItem::skuId, it -> it));
        List<Sku> skus = skuMapper.selectByProductId(productId);
        Map<UUID, StockView> stocks =
                stockReadQuery.availableBySkuIds(skus.stream().map(Sku::getId).toList());
        boolean anyOnSaleWithStock = skus.stream().anyMatch(s -> {
            SkuUpdateItem item = byId.get(s.getId());
            // 本次操作会置停用的行不参与「在售」；未涉及的 SKU 用当前状态与当前库存
            SkuStatus finalStatus = item != null && item.status() != null ? item.status() : s.getStatus();
            if (finalStatus != SkuStatus.ON_SALE) return false;
            int finalStock = item != null ? item.stock() : StockView.stockOrZero(stocks.get(s.getId()));
            return finalStock > 0;
        });
        Validate.isTrue(anyOnSaleWithStock, "上架商品的库存不能全为 0，请先下架商品或补充库存");
    }

    // 入参
    /**
     * 一个规格维度的选择：attrId 定位模板属性，valueIds 选值域内值，customValues 提交值域外新值
     * （仅当 attr.allow_custom 时受理，自动建档 source=2）。两列表至少一非空（resolveSelections 判 SPEC_SELECTION_EMPTY）。
     */
    public record SpecSelection(
            UUID attrId,
            List<UUID> valueIds,
            List<String> customValues,
            Map<UUID, String> valueImages,
            Map<String, String> customValueImages) {}
}
