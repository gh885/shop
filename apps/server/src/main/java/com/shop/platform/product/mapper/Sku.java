package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 商品 SKU —— 具体卖法，存"卖多少钱、有多少货"。
 *
 * <p>一个 SPU 挂 0..N 个 SKU，靠 productId 连线。买家下单扣的是 SKU 的 price；售价与展示归本模块，
 * 库存不归本模块（V19 起唯一真相源在 inventory.sku_stock，见 inventory 模块）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName(value = "product.skus", autoResultMap = true)
public class Sku {

    /** SKU 状态，见 status 字段 javadoc：1 在售 / 0 停用，与 SPU 状态无关 */
    public static final int STATUS_ON_SALE = 1;

    public static final int STATUS_DISABLED = 0;

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 归属的 SPU ID，1:N 关系的落点。查"某商品的所有 SKU"靠它，uk_skus_product_attrs 左前缀已覆盖索引 */
    private UUID productId;

    /**
     * 业务编码（如 IP15-256-BLK），全局唯一。
     *
     * <p>id 是给数据库用的 UUID，人记不住；skUCode 是给仓管/物流面单/外部 ERP 对账用的短码。 允许为 NULL：没有编号的 SKU 也能存在，多个 NULL 不冲突。
     */
    private String skuCode;

    /**
     * SPU 名 + 规格值拼接的显示名（如「iPhone 15 Pro 256G 黑色」），刻意冗余。
     *
     * <p>三个原因：① 历史订单要快照下单那一刻的名称，之后 SPU 改名不影响旧订单； ② 列表/搜索/购物车直接取值，免 join 回 SPU 现拼； ③
     * 规格名可定制（显示"曜石黑"而非"黑色"）。
     */
    private String name;

    /**
     * 规格取值（JSONB），必须是 Product.specs 模板里存在的值。
     *
     * <p>SPU 管"可选哪些值"（values），SKU 管"这行选了哪个值"：
     * [{attrId, valueId, name, value}] —— attrId/valueId 是身份，name/value 是快照冗余（订单/展示免 join）。
     * 唯一性不由本列承担，见 specKey。
     */
    @TableField(typeHandler = JsonbSkuAttrsHandler.class)
    private List<SkuAttr> attributes;

    /**
     * SKU 身份：valueId 按模板维度顺序 ':' join（无规格商品为 ''），uk_skus_product_spec_key 唯一索引的落点。
     *
     * <p>规格值改名只改 name/value 快照，spec_key 不变——对账按它走，改名不再被视为新组合，价格库存不丢。
     */
    private String specKey;

    /** 该规格自己的图（如黑色款单独一张图），与 SPU 的 mainImage 区分，可空 */
    private String image;

    /** 成交价（分）。唯一真价，Product.minPrice/maxPrice 是它的冗余副本；存分避免浮点误差 */
    private Long price;

    /** 划线价（分），展示「¥399 划掉、现价 ¥299」用，可空 */
    private Long originalPrice;

    /** 币种（如 CNY），与 price 一起组成代码里的 Money 类型 */
    private String currency;

    /** 1 在售 / 0 停用。注意与缺货区分：缺货可补可恢复，停用是"这个卖法不卖了" */
    private Integer status;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
