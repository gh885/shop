package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Validate;
import com.shop.platform.product.model.ProductStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 商品 SPU —— 商品本体，存"是什么"。
 *
 * <p>只存不变的定义信息（名称/图片/规格模板），价格、库存等变体数据在 Sku 表。 一个 SPU 通过 Sku.productId 挂 0..N 个 SKU。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName(value = "product.products", autoResultMap = true)
public class Product {

    // ---- 状态谓词：委托领域枚举的状态机（{@link ProductStatus}），service 读起来像业务语言而非魔法数字比较 ----

    public boolean isPublished() {
        return status != null && status.isPublished();
    }

    public boolean isOff() {
        return status != null && status.isOff();
    }

    public boolean isDraft() {
        return status != null && status.isDraft();
    }

    // ---- 状态流转：守卫 + 变更一体，不变式在实体内不可绕过；持久化（updateById）留在 service ----

    /** 上架：仅草稿可发布（跨聚合门槛「SKU 全部设价」由 service 复检，不在此处） */
    public void publish() {
        Validate.isTrue(isDraft(), 409, "只有草稿可以发布");
        status = ProductStatus.PUBLISHED;
    }

    /** 下架：仅上架可下架 */
    public void off() {
        Validate.isTrue(isPublished(), 409, "只有上架商品可以下架");
        status = ProductStatus.OFF;
    }

    /** 重新上架：仅下架可重上（重上前 SKU 设价复检同样在 service） */
    public void relist() {
        Validate.isTrue(isOff(), 409, "只有下架商品可以重新上架");
        status = ProductStatus.PUBLISHED;
    }

    /** 规格可编辑性守卫：上架商品规格冻结（价格库存可改，规格组合不可改），要改规格先下架 */
    public void ensureSpecsEditable() {
        Validate.isTrue(status == null || status.isSpecsEditable(), 409, "上架商品不能修改规格，请先下架");
    }

    /** 放弃（删除）守卫：仅草稿可放弃；上架/下架商品是经营资产，不做物理删除。 */
    public void ensureAbandonable() {
        Validate.isTrue(isDraft(), 409, "只有草稿可以放弃，已发布/下架商品需走下架");
    }

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 归属店铺 ID。shop 模块尚未落地，此处跨 schema 裸引用、不加外键约束；商家后台按它查自己的商品 */
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
    @TableField(typeHandler = JsonbStringListHandler.class)
    private List<String> detailImages;

    /** 主图 key（对象存储 key 非完整 URL）。列表页缩略图、商品页首图优先加载它，各规格差异图在 Sku.image */
    private String mainImage;

    /**
     * 轮播图 key 数组（JSONB），如 ["product/a.jpg","product/b.jpg"]。 选择 JSONB 而不是独立表：这些图只是"摆给买家看"，不参与查询/筛选。
     * 等需要单独管理图片（上传进度、裁剪、审核）时再拆成表。存对象存储 key，非完整 URL。
     */
    @TableField(typeHandler = JsonbStringListHandler.class)
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
    @TableField(typeHandler = JsonbSpecItemsHandler.class)
    private List<SpecItem> specs;

    /**
     * 非销售参数（JSONB）—— 只展示、不参与 SKU 生成。
     *
     * <p>判断标准：换一个值价格/库存不变，就是参数，如： [{"name":"产地","value":"广东"},{"name":"上市年份","value":"2026"}]
     * 买家不"选"它，只是看详情页的一行文字。SKU 行里没有它的副本。
     */
    @TableField(typeHandler = JsonbParamItemsHandler.class)
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

    /**
     * 商品状态：概念上是领域枚举（{@link ProductStatus}），状态机/谓词归枚举；
     * 实体只持裸字段并薄委托，不重复定义。不做物理删除。
     */
    private ProductStatus status;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
