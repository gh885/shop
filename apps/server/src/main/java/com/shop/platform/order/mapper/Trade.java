package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.order.api.AfterSaleBadge;
import com.shop.platform.order.model.TradeClosedReason;
import com.shop.platform.order.model.TradeStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 主订单 —— 一次支付的载体，1 : N 子订单（{@link Order}）。
 *
 * <p>只承载支付与金额汇总，不承载履约；「部分退款 / 全额退款」不落列，由
 * {@code refunded_amount} 与 {@code paid_amount} 比较得出（docs/domain/order-model.md §4.1）。
 *
 * <p>收货快照在下单瞬间定格；七列 {@code receiver_*} 合起来就是模型里的 {@code address_snapshot}。
 * 金额列与币种列配对成 Money，只读转换不落库。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("orders.trades")
public class Trade extends AuditedEntity {

    /** 对外单号，全局唯一 */
    private String tradeNo;

    /** 买家 ID，account.users.id，跨 schema 裸引用不加 FK */
    private UUID userId;

    /** 支付状态：待支付 → 已支付 → 已关闭 */
    private TradeStatus status;

    /** 关单原因：status = CLOSED 时必填（DB CHECK） */
    private TradeClosedReason closedReason;

    private Long itemAmount;

    private Long shippingFee;

    /** 兜底优惠池：主订单级总额，分摊到全部子订单的行（§6） */
    private Long discountAmount;

    /** 实付 = item_amount + shipping_fee − discount_amount（DB CHECK 钉死） */
    private Long payAmount;

    /** 已付 */
    private Long paidAmount;

    /** 已退 = 按行退款 + 运费退款，不含补偿 */
    private Long refundedAmount;

    /** 已付补偿，与 refunded_amount 分开计数 */
    private Long compensatedAmount;

    /** 售后角标投影（§5.4）：主订单下任一子订单有未完结退款即退款中；单据真相在 aftersale.refunds */
    private AfterSaleBadge afterSaleBadge;

    private String currency;

    // 收货快照（= address_snapshot），下单定格、永不更新
    private String receiverName;

    private String receiverPhone;

    /** 国标区划码：运费按地区计价的键与凭据 */
    private String receiverRegionCode;

    private String receiverProvince;

    private String receiverCity;

    private String receiverDistrict;

    private String receiverDetail;

    private String buyerMessage;

    /** 待支付截止，超时自动关单的扫描依据 */
    private OffsetDateTime payExpireAt;

    private OffsetDateTime paidAt;

    private OffsetDateTime closedAt;

    /** 结算幂等键：同一次结算只落一张主订单 */
    private UUID checkoutKey;

    public Money itemAmountAsMoney() {
        return Money.ofFen(itemAmount, currency);
    }

    public Money shippingFeeAsMoney() {
        return Money.ofFen(shippingFee, currency);
    }

    public Money discountAmountAsMoney() {
        return Money.ofFen(discountAmount, currency);
    }

    public Money payAmountAsMoney() {
        return Money.ofFen(payAmount, currency);
    }

    public Money paidAmountAsMoney() {
        return Money.ofFen(paidAmount, currency);
    }

    public Money refundedAmountAsMoney() {
        return Money.ofFen(refundedAmount, currency);
    }

    public Money compensatedAmountAsMoney() {
        return Money.ofFen(compensatedAmount, currency);
    }
}
