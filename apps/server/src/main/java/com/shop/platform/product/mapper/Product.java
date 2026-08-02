package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.JsonbTypeHandler;
import java.time.OffsetDateTime;
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
@TableName("product.products")
public class Product {

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 归属店铺 ID。shop 模块尚未落地，此处跨 schema 裸引用、不加外键约束；商家后台按它查自己的商品 */
    private UUID shopId;

    /** 主分类 ID。V1 只支持单主分类（挂在末级分类下），多分类需求出现时再拆关联表 */
    private UUID categoryId;

    /** 商品名。搜索命中、列表标题、商品页标题共用，越短越准 */
    private String name;

    /** 副标题/一句话卖点。列表页常显示在商品名下方，可空 */
    private String subtitle;

    /** 详情页大段图文介绍（富文本 HTML）。只影响详情页渲染，与列表/搜索无关，单独存大字段 */
    private String description;

    /** 主图 URL。列表页缩略图、商品页首图都优先加载它，各规格的差异图放在 Sku.image */
    private String mainImage;

    /**
     * 轮播图 URL 数组（JSONB），如 ["/img/1.jpg","/img/2.jpg"]。 选择 JSONB 而不是独立表：这些图只是"摆给买家看"，不参与查询/筛选。
     * 等需要单独管理图片（上传进度、裁剪、审核）时再拆成表。
     */
    @TableField(typeHandler = JsonbTypeHandler.class)
    private String images;

    /**
     * 销售属性模板（JSONB）—— SKU 的生成公式。
     *
     * <p>每个维度是一个 {name, values}，SKU 按所有维度的笛卡尔积生成：
     * [{"name":"颜色","values":["黑","白"]},{"name":"尺码","values":["S","M","L"]}] 会生成 2×3=6 个 SKU。
     *
     * <p>判断一个维度是不是销售属性的标准：换一个值价格/库存会不会变，会，就是销售属性。 单规格商品为 []，此时恰好生成 1 个 SKU（价格库存仍需放 Sku 表）。 与 params
     * 分开存，防止参数被误当规格生成出无意义的 SKU。
     */
    @TableField(typeHandler = JsonbTypeHandler.class)
    private String specs;

    /**
     * 非销售参数（JSONB）—— 只展示、不参与 SKU 生成。
     *
     * <p>判断标准：换一个值价格/库存不变，就是参数，如： [{"name":"产地","value":"广东"},{"name":"上市年份","value":"2026"}]
     * 买家不"选"它，只是看详情页的一行文字。SKU 行里没有它的副本。
     */
    @TableField(typeHandler = JsonbTypeHandler.class)
    private String params;

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

    /** 商品状态：1 上架 / 0 下架 / 2 草稿。不做物理删除 */
    private Integer status;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
