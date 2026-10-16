package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.shop.platform.common.Money;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.product.model.ParamItem;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.model.SpecItem;
import com.shop.platform.product.model.SpecValue;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 商品 SPU —— 商品本体，存"是什么"。
 *
 * <p>只存不变的定义信息（名称/图片/规格模板），价格、库存等变体数据在 Sku 表。 一个 SPU 通过 Sku.productId 挂 0..N 个 SKU。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName(value = "product.products", autoResultMap = true)
public class Product extends AuditedEntity {

    // 状态谓词：委托领域枚举的状态机（{@link ProductStatus}），service 读起来像业务语言而非魔法数字比较
    public boolean isPublished() {
        return status != null && status.isPublished();
    }

    public boolean isWarehouse() {
        return status != null && status.isWarehouse();
    }

    public boolean isDraft() {
        return status != null && status.isDraft();
    }

    // 状态流转：守卫 + 变更一体，不变式在实体内不可绕过；持久化（updateById）留在 service
    /** 按目标态发布：仅草稿可发布，目标只能是上架（立即上架）或仓库中（放入仓库）。
     *  跨聚合门槛「SKU 全部设价」由 service 复检，不在此处。 */
    public void publishTo(ProductStatus target) {
        Validate.isTrue(target == ProductStatus.PUBLISHED || target == ProductStatus.WAREHOUSE, "发布目标只能是上架或仓库");
        Validate.conflict(isDraft(), "只有草稿可以发布");
        status = target;
    }

    /** 下架：仅上架可下架，落仓库中 */
    public void off() {
        Validate.conflict(isPublished(), "只有上架商品可以下架");
        status = ProductStatus.WAREHOUSE;
    }

    /** 重新上架：仅仓库中可重上（重上前 SKU 设价复检同样在 service） */
    public void relist() {
        Validate.conflict(isWarehouse(), "只有仓库中的商品可以重新上架");
        status = ProductStatus.PUBLISHED;
    }

    /** 规格可编辑性守卫：上架商品规格冻结（价格库存可改，规格组合不可改），要改规格先下架 */
    public void ensureSpecsEditable() {
        Validate.conflict(status == null || status.isSpecsEditable(), "上架商品不能修改规格，请先下架");
    }

    /** 放弃（删除）守卫：仅草稿可放弃；上架/下架商品是经营资产，不做物理删除。 */
    public void ensureAbandonable() {
        Validate.conflict(isDraft(), "只有草稿可以放弃，已发布/下架商品需走下架");
    }

    // 派生：价格区间与规格组合——数据自己说得出口的话，service 只编排持久化
    /**
     * 一次算好 min/max 价格冗余副本（真实成交价永远以 skus.price 为准；全部未定价时两端为 null）。
     * 只反映「在售 SKU」（买家实际可购集）：停用 SKU 的价不计入，否则列表「¥299 起」可能摘自已停用 SKU，
     * 点进去买不到（publicDetail 只返在售）。
     *
     * <p>币种跟着价格走：区间是从 SKU 的价格聚合出来的，币种也就取那些 SKU 的币种（同为 null 时落平台默认币种，
     * 此时两列都不写值，币种只是占住 NOT NULL）。
     */
    public void applyPriceRange(List<Sku> skus) {
        List<Sku> priced = skus.stream()
                .filter(Sku::isOnSale)
                .filter(s -> s.getPrice() != null)
                .toList();
        minPrice = priced.stream().map(Sku::getPrice).min(Long::compare).orElse(null);
        maxPrice = priced.stream().map(Sku::getPrice).max(Long::compare).orElse(null);
        currency = priced.stream()
                .map(Sku::getCurrency)
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(Money.CNY);
    }

    /** 区间下限为 Money；草稿期未定价时为 null */
    public Money minPriceAsMoney() {
        return Money.ofFenOrNull(minPrice, currency);
    }

    /** 区间上限为 Money；草稿期未定价时为 null */
    public Money maxPriceAsMoney() {
        return Money.ofFenOrNull(maxPrice, currency);
    }

    /** 列表展示价（由查询侧按「当前可售 SKU」重算的分值）换算为 Money。
     * 与 {@link #minPriceAsMoney()} 一样由实体换算：币种是本实体的一列，把「分值 + 币种」拼成 Money
     * 是实体的活（MoneyTypeRulesTest）。两处若各拼一次，就会在「缺价算 0 / 算 null」上给出两个答案。 */
    public Money displayMinPriceAsMoney(Long computedMinPrice) {
        return Money.ofFenOrNull(computedMinPrice, currency);
    }

    /** 列表展示价上限换算为 Money；见 {@link #displayMinPriceAsMoney(Long)} 的理由。 */
    public Money displayMaxPriceAsMoney(Long computedMaxPrice) {
        return Money.ofFenOrNull(computedMaxPrice, currency);
    }

    /** 规格模板的笛卡尔积：specs 为空时返回 [[]]，恰好对应单规格商品的 1 个隐藏 SKU；各维取值按 valueId 去重 */
    public List<List<SpecValue>> specCombinations() {
        List<List<SpecValue>> result = new ArrayList<>();
        result.add(new ArrayList<>());
        for (SpecItem dim : specs == null ? List.<SpecItem>of() : specs) {
            Map<UUID, SpecValue> dedup = new LinkedHashMap<>();
            for (SpecValue v : dim.values()) {
                dedup.putIfAbsent(v.valueId(), v);
            }
            List<List<SpecValue>> next = new ArrayList<>();
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

    /** 当前规格快照能产出的全部组合 spec_key；无规格（单规格商品）为 {""}。与 SkuService.updateSpecs 的口径一致 */
    public Set<String> currentSpecKeys() {
        return specCombinations().stream().map(Sku::specKeyOf).collect(Collectors.toSet());
    }

    /** 归属店铺 ID：跨 schema（product → shop）裸引用不加外键，模块边界靠对方 api 维持；商家后台按它查自己的商品 */
    private UUID shopId;

    /** 主分类 ID。V1 只支持单主分类（挂在末级分类下），多分类需求出现时再拆关联表 */
    private UUID categoryId;

    /** 商品名（搜索标题）。搜索召回、列表标题、商品页标题共用，上限 30 字（卡片展示就那么宽，写长了只会被截断） */
    private String name;

    /** 一句话卖点。商品详情页标题下方展示，可空；非空时由入参层限定 10~30 字 */
    private String subtitle;

    /**
     * 详情图流（JSONB 图片 key 数组）—— 详情页按序铺开渲染的一组图，代替富文本 HTML。
     * 淘宝式详情就是几张图，不是一段 HTML（省富文本编辑器、灭 XSS 面、天然响应式、逐张走 CDN）。
     * 存对象存储 key（非完整 URL），展示时拼当前环境域名。
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> detailImages;

    /** 主图 key（对象存储 key 非完整 URL）。列表页缩略图、商品页首图优先加载它，各规格差异图在 Sku.image */
    private String mainImage;

    /**
     * 轮播图 key 数组（JSONB），如 ["product/a.jpg","product/b.jpg"]。 选择 JSONB 而不是独立表：这些图只是"摆给买家看"，不参与查询/筛选。
     * 等需要单独管理图片（上传进度、裁剪、审核）时再拆成表。存对象存储 key，非完整 URL。
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> images;

    /**
     * 销售属性模板（JSONB）—— SKU 的生成公式。
     *
     * <p>每个维度是一个 {attrId, name, values:[{valueId, value}]}，SKU 按所有维度的笛卡尔积生成，
     * 身份为 valueId 组合（skus.spec_key）：[{"attrId":...,"name":"颜色","values":[{"valueId":...,"value":"黑"}]}]。
     *
     * <p>判断一个维度是不是销售属性的标准：换一个值价格/库存会不会变，会，就是销售属性。 单规格商品为 []，此时恰好生成 1 个 SKU（价格库存仍需放 Sku 表）。 与 params
     * 分开存，防止参数被误当规格生成出无意义的 SKU。attrId/valueId 指向类目属性模板（category_attrs），name/value 是显示快照。
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<SpecItem> specs;

    /**
     * 非销售参数（JSONB）—— 只展示、不参与 SKU 生成。
     *
     * <p>判断标准：换一个值价格/库存不变，就是参数，如： [{"name":"产地","value":"广东"},{"name":"上市年份","value":"2026"}]
     * 买家不"选"它，只是看详情页的一行文字。SKU 行里没有它的副本。
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<ParamItem> params;

    /**
     * SKU 聚合最低售价（分），冗余副本，刻意为之。
     *
     * <p>真实成交价永远以 skus.price 为准；这里的值是从所有 SKU 的 price 汇总出来的， 目的只是让列表页免查 SKU 就能展示「¥299 起」并按价格排序/筛选。
     * 代价：SKU 价格变更后本字段会过期，需在更新 SPU/SKU 时同步重算。
     */
    private Long minPrice;

    /**
     * SKU 聚合最高售价（分），冗余副本，与 minPrice 组成价格区间。
     *
     * <p>来源同样是各 SKU 的 price，单规格商品时 minPrice == maxPrice。
     */
    private Long maxPrice;

    /** 价格区间的币种（如 CNY），与 min/max 一起组成 Money；由 {@link #applyPriceRange} 随价格一同落 */
    private String currency;

    /**
     * 是否支持七天无理由退货（消保法第 25 条）：TRUE = 支持（法条默认），FALSE = 卖家声明属法定除外商品
     * （定作、鲜活易腐、在线下载、拆封后不宜退货…）。
     *
     * <p>下单瞬间快照进 orders.items，售后强制判定只读快照——本列事后被改，不追溯已卖出的单。
     */
    private boolean sevenDayReturn;

    /**
     * 累计销量（已完成订单成交件数之和）——product 自持的投影列，订单完成时经 product.api :: ProductCommand 单语句自增。
     * 实体插入/回写永不带这一列（DB 默认 0；updateById 若把读到的旧值写回，会覆盖并发累加），只由 addSoldCount 改。
     */
    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private long soldCount;

    /**
     * 商品状态：概念上是领域枚举（{@link ProductStatus}），状态机/谓词归枚举；
     * 实体只持裸字段并薄委托，不重复定义。不做物理删除。
     *
     * <p>回写永不带这一列（插入要带：新建商品得落初始态 DRAFT）。状态有第二个写者——平台停业级联下架
     * （{@code ProductMapper.takedownPublished}）与卖家上下架（{@code ProductMapper.transitionStatus}）都是条件更新；
     * 而卖家编辑商品走 {@code updateById} 整行回写，若把打开页面时读到的旧状态写回，就把并发的下架静默撤销了
     * （与 {@code soldCount} 同一个坑，见 docs/adr/0001）。service 里不存在 {@code setStatus} 后回写的路径，
     * 所有状态流转只经 mapper 的条件更新；{@code ProductStaleWritebackIT} 是回归样本。
     */
    @TableField(updateStrategy = FieldStrategy.NEVER)
    private ProductStatus status;
}
