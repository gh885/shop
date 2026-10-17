package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import com.shop.platform.infra.db.BaseEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 订单行项目 —— 下单瞬间的商品快照，存"这一行卖的是什么、单价多少、买了几件"。
 *
 * <p>name/price/image 全部定格：之后 SPU 改名、SKU 调价都不影响旧订单展示与对账。
 * seven_day_return 同理由定格：它决定买家买到手时有多少退货权利，不能跟着 SPU 后来的设置变。
 *
 * <p>账本口径（docs/domain/order-model.md §4.3）：快照列除金额/数量汇总列外不 UPDATE。
 * 分摊列在下单时算好；shipped / refunded / settled 三列只由发货、取消、退款成功的重算入口
 * 用条件 UPDATE 累加，行落库后没有整行回写的路径，故无 updated_at。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("orders.items")
public class OrderItem extends BaseEntity {

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

    /** 分摊到本行的优惠（定向券 + 兜底池），分；DB CHECK 钉死 ≤ amount（INV-9） */
    private Long discountAllocated;

    /** 分摊到本行的运费，分；子订单内按行金额占比分摊（§6.1） */
    private Long shippingAllocated;

    /** 行商品实付 = amount − discount_allocated，分（§4.3） */
    private Long goodsPaidAmount;

    /** 行实付 = goods_paid_amount + shipping_allocated，分（§4.3 / INV-5） */
    private Long refundableAmount;

    /** 当前有效发货量 = 累计发出量 − 已成功的退货退款量；仅退款与补偿不动它（§4.3 / INV-10） */
    private Integer shippedQuantity;

    /** 累计已退数量，只统计成功终态的 item 型退款行（§4.3 / INV-12） */
    private Integer refundedQuantity;

    /** 义务结清量 = shipped_quantity + refunded_quantity，且 ≤ quantity（§4.3 / INV-11） */
    private Integer settledQuantity;

    /** 已退商品款，分；≤ goods_paid_amount（§4.3 / INV-13） */
    private Long refundedAmount;

    /**
     * 七天无理由退货声明快照（下单瞬间取自 SPU）：售后判「卖家能不能拒」只读这一列——
     * 卖家事后关掉开关，抹不掉买家买到时手上的权利（AFS-45）
     */
    private boolean sevenDayReturn;

    // 派生视图：金额列 + 币种列配对成 Money，只读转换不落库（非表字段）
    public Money priceAsMoney() {
        return Money.ofFen(price, currency);
    }

    /** 划线价可空，随原值返回 null */
    public Money originalPriceAsMoney() {
        return Money.ofFenOrNull(originalPrice, currency);
    }

    public Money amountAsMoney() {
        return Money.ofFen(amount, currency);
    }

    public Money discountAllocatedAsMoney() {
        return Money.ofFen(discountAllocated, currency);
    }

    public Money shippingAllocatedAsMoney() {
        return Money.ofFen(shippingAllocated, currency);
    }

    public Money goodsPaidAmountAsMoney() {
        return Money.ofFen(goodsPaidAmount, currency);
    }

    public Money refundableAmountAsMoney() {
        return Money.ofFen(refundableAmount, currency);
    }

    public Money refundedAmountAsMoney() {
        return Money.ofFen(refundedAmount, currency);
    }
}
