package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.aftersale.model.RefundLineType;
import com.shop.platform.common.Money;
import com.shop.platform.infra.db.BaseEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 退款单行 —— 一行钱；item 型挂订单行与数量，shipping / compensation 型两者皆空。
 *
 * <p>运费单独成行是有意的：它不被行的金额上限拦下，也仍然计入 {@code refunded_amount}（§6.2）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("aftersale.refund_lines")
public class RefundLine extends BaseEntity {

    /** 所属退款单，aftersale.refunds.id */
    private UUID refundId;

    /** 订单行，orders.items.id；仅 item 型有值 */
    private UUID orderItemId;

    private RefundLineType lineType;

    /** 本次退款数量；仅 item 型有值 */
    private Integer quantity;

    private Long amount;

    private String currency;

    /** 未完结闸门标记：父单到终态时置 false，让出「同一订单行一张未完结」的名额（V85 部分唯一索引）。
     *  用包装类型：插入时必须显式给 true，漏给则由 DB 默认值兜底（原始布尔会静默写成 false，闸门失效）。 */
    private Boolean active;

    public Money amountAsMoney() {
        return Money.ofFen(amount, currency);
    }
}
