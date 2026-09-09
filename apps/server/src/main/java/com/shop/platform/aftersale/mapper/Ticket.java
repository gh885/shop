package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.aftersale.model.TicketStatus;
import com.shop.platform.aftersale.model.TicketType;
import com.shop.platform.common.Money;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 售后单 —— 一次售后申请的完整生命周期。订单是它的上游快照来源（order_id 裸引用，不加 FK），
 * 资金态在 payment.payments，这里只记「该退多少、退没退成」。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("aftersale.tickets")
public class Ticket {

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler） */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 所属订单，orders.orders.id */
    private UUID orderId;

    /** 买家（申请人），auth.users.id */
    private UUID userId;

    /** 卖家店铺（处理方），shop.shops.id */
    private UUID shopId;

    /** 行项售后预留：NULL = 整单售后（V1 只有整单） */
    private UUID orderItemId;

    private TicketType type;

    /** 售后状态机（转移表见 TicketAction） */
    private TicketStatus status;

    /** 买家申请理由，可空 */
    private String reason;

    /** 退款口径（分），V1 = 整单实付；资金态在 payment 模块 */
    private Long refundAmount;

    private String currency;

    /** 退货物流公司（买家回寄退货时填写，仅退货退款路径） */
    private String returnLogisticsCompany;

    /** 退货运单号（买家回寄退货时填写，仅退货退款路径） */
    private String returnTrackingNo;

    /** 退款完成时刻（REFUNDED 时回填） */
    private OffsetDateTime refundedAt;

    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;

    /** 退款口径配上币种成 Money（只读转换，非表字段） */
    public Money refundAmountAsMoney() {
        return refundAmount == null ? null : Money.ofFen(refundAmount, currency);
    }
}
