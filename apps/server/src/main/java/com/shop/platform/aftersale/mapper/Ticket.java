package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.aftersale.model.AfterSaleReason;
import com.shop.platform.aftersale.model.TicketStatus;
import com.shop.platform.aftersale.model.TicketType;
import com.shop.platform.common.Money;
import com.shop.platform.infra.db.AuditedEntity;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 售后单 —— 一次售后申请的完整生命周期。订单是它的上游快照来源（order_id 裸引用，不加 FK），
 * 资金态在 payment.payments，这里只记「该退多少、退没退成」。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("aftersale.tickets")
public class Ticket extends AuditedEntity {

    /** 所属订单，orders.orders.id */
    private UUID orderId;

    /** 买家（申请人），account.users.id */
    private UUID userId;

    /** 卖家店铺（处理方），shop.shops.id */
    private UUID shopId;

    /** 行项售后预留：NULL = 整单售后（V1 只有整单） */
    private UUID orderItemId;

    private TicketType type;

    /** 售后状态机 */
    private TicketStatus status;

    /** 申请原因枚举（判定依据）；V63 前的历史单为 null，不补编成「其他」 */
    private AfterSaleReason reasonCode;

    /** 买家申请理由，可空（补充说明，不是判定依据） */
    private String reason;

    /**
     * 无理由强制单（AFS-45）：申请那一刻成立（原因=无理由 + 订单行快照支持 + 签收后 7 天内），
     * 卖家在申请阶段无法拒绝（下发与落点两道门）。定格成列而不是每次现算：窗口会随卖家拖延走过期，
     * 现算等于把「买家已合法主张的权利」交给卖家的处理时长决定。
     */
    private boolean noReasonEnforced;

    /** 退款口径（分），V1 = 整单实付；资金态在 payment 模块 */
    private Long refundAmount;

    private String currency;

    /** 退货物流公司（买家回寄退货时填写，仅退货退款路径） */
    private String returnLogisticsCompany;

    /** 退货运单号（买家回寄退货时填写，仅退货退款路径） */
    private String returnTrackingNo;

    /** 退款完成时刻（REFUNDED 时回填） */
    private OffsetDateTime refundedAt;

    /** 退款口径配上币种成 Money（只读转换，非表字段） */
    public Money refundAmountAsMoney() {
        return Money.ofFenOrNull(refundAmount, currency);
    }
}
