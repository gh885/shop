package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.shop.platform.common.Money;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.product.model.SkuAttr;
import com.shop.platform.product.model.SkuStatus;
import com.shop.platform.product.model.SpecValue;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 商品 SKU —— 具体卖法，存"卖多少钱、有多少货"。
 *
 * <p>一个 SPU 挂 0..N 个 SKU，靠 productId 连线。买家下单扣的是 SKU 的 price；售价与展示归本模块，
 * 库存不归本模块（V19 起唯一真相源在 inventory.sku_stock）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName(value = "product.skus", autoResultMap = true)
public class Sku extends AuditedEntity {

    /** SKU 名列上限（与 skus.name VARCHAR(160) 同值） */
    private static final int NAME_MAX = 160;

    public boolean isOnSale() {
        return status != null && status.onSale();
    }

    /** SKU 身份：valueId 按模板维度顺序 ':' join，无规格商品为 ''（uk_skus_product_spec_key 的落点） */
    public static String specKeyOf(List<SpecValue> combo) {
        return combo.stream().map(v -> v.valueId().toString()).collect(Collectors.joining(":"));
    }

    /** 显示名公式：SPU 名 + 各规格值空格连接，如「iPhone 15 Pro 256G 黑色」；单规格/无规格即 SPU 名本身。截断到列上限 */
    public static String nameOf(Product product, List<String> values) {
        String name = values.isEmpty() ? product.getName() : product.getName() + " " + String.join(" ", values);
        return name.length() > NAME_MAX ? name.substring(0, NAME_MAX) : name;
    }

    /** 归属的 SPU ID，1:N 关系的落点。查"某商品的所有 SKU"靠它，uk_skus_product_attrs 左前缀已覆盖索引 */
    private UUID productId;

    /**
     * 归属店铺 ID，冗余自所属 SPU（商品不换店，故建 SKU 时一次写入）。
     *
     * <p>存在的唯一理由是 {@link #skuCode} 的唯一性作用域：唯一索引不能跨表 join 到 products 取 shop_id，
     * 而「同一商家内不重号」必须落到索引上才有并发保证。顺带让「按店查 SKU」免回表。
     */
    private UUID shopId;

    /**
     * 业务编码（如 IP15-256-BLK），<b>店内唯一</b>（uk_skus_shop_code）。
     *
     * <p>id 是给数据库用的 UUID，人记不住；skuCode 是给仓管/物流面单/外部 ERP 对账用的短码。
     * 作用域是商家自己的命名空间而不是全平台：同一品牌的多个经销商常用同一套 ERP 货号，
     * 全局唯一会让后入驻的商家在自己店里填一个「已被占用」的编码、且按隐私口径无法告知冲突方是谁。
     * 允许为 NULL：没有编号的 SKU 也能存在，多个 NULL 不冲突。
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
    @TableField(typeHandler = JacksonTypeHandler.class)
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

    /** 在售 / 停用。注意与缺货区分：缺货可补可恢复，停用是「这个卖法不卖了」。概念归 {@link SkuStatus} */
    private SkuStatus status;

    // 派生：金额两列（分 + 币种）在这一处收成 Money，消费方不再各自拼
    /** 成交价为 Money；草稿期未定价时为 null */
    public Money priceAsMoney() {
        return Money.ofFenOrNull(price, currency);
    }

    /** 划线价为 Money；没挂划线价时为 null */
    public Money originalPriceAsMoney() {
        return Money.ofFenOrNull(originalPrice, currency);
    }
}
