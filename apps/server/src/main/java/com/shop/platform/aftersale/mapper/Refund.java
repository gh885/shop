package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.aftersale.model.RefundStatus;
import com.shop.platform.aftersale.model.RefundType;
import com.shop.platform.common.Money;
import com.shop.platform.infra.db.AuditedEntity;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 退款单 —— 一次退款的聚合根，1 : N 退款单行；每次向渠道发起的调用另落 {@link RefundExecution}。
 *
 * <p>支付归属（trade_id）与业务归属（order_id）都存：退款要能对上一笔支付，也要能对上是哪张子订单。
 * 金额只记「本次退多少」，累计口径落在订单行与子订单的汇总列上（§4.5 / §7）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("aftersale.refunds")
public class Refund extends AuditedEntity {

    /** 支付归属：orders.trades.id */
    private UUID tradeId;

    /** 业务归属：orders.orders.id */
    private UUID orderId;

    /** 买家（申请人），account.users.id */
    private UUID userId;

    /** 卖家店铺（处理方），shop.shops.id */
    private UUID shopId;

    /** 对外退款单号，全局唯一 */
    private String refundNo;

    /** 按货的去向划分的类型 */
    private RefundType type;

    /** 本次退款总额 = Σ 退款单行金额 */
    private Long amount;

    private String currency;

    private RefundStatus status;

    /** 退款原因（自由文本） */
    private String reason;

    /** 退货物流公司 code（仅退货退款） */
    private String returnCarrierCode;

    /** 退货物流公司展示名快照（仅退货退款） */
    private String returnCarrierName;

    /** 退货运单号（仅退货退款） */
    private String returnTrackingNo;

    /** 退款成功时刻：status = REFUNDED 时必填（DB CHECK） */
    private OffsetDateTime succeededAt;

    /** 金额列 + 币种列配对成 Money，只读转换不落库 */
    public Money amountAsMoney() {
        return Money.ofFen(amount, currency);
    }
}
