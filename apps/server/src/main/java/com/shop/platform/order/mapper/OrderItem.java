package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 订单行项目 —— 下单瞬间的商品快照，存"这一行卖的是什么、单价多少、买了几件"。
 *
 * <p>name/price/image 全部定格：之后 SPU 改名、SKU 调价都不影响旧订单展示与对账。
 * 行落库后永不 UPDATE（改数量 = 取消重下），故无 updated_at。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("orders.items")
public class OrderItem {

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler） */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 所属订单 ID，orders.orders.id（同 schema，应用层保证一致性） */
    private UUID orderId;

    /** SPU ID，product.products.id，裸引用不加 FK；评价「买过才能评」、再次购买定位用 */
    private UUID productId;

    /** SKU ID，product.skus.id，裸引用不加 FK */
    private UUID skuId;

    /** SKU 展示名快照（SPU 名 + 规格值拼接，同 product.skus.name 生成口径） */
    private String name;

    /** 图片快照：下单时已解析好（SKU 图空则回落 SPU 主图），读端零逻辑 */
    private String image;

    /** 成交单价快照，分 */
    private Long price;

    /** 划线价快照，分，可空 */
    private Long originalPrice;

    /** 币种（如 CNY），与 price 组成 Money */
    private String currency;

    /** 购买数量，1~999 */
    private Integer quantity;

    /** 行小计，分，落库固化免读时重算；DB CHECK 钉死 amount = price × quantity */
    private Long amount;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    // ---- 派生视图：金额列 + 币种列配对成 Money，只读转换不落库（非表字段） ----

    public Money priceAsMoney() {
        return Money.ofFen(price, currency);
    }

    /** 划线价可空，随原值返回 null */
    public Money originalPriceAsMoney() {
        return originalPrice == null ? null : Money.ofFen(originalPrice, currency);
    }

    public Money amountAsMoney() {
        return Money.ofFen(amount, currency);
    }
}
