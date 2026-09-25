package com.shop.platform.aftersale.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.aftersale.mapper.Ticket;
import com.shop.platform.aftersale.model.AfterSaleReason;
import com.shop.platform.aftersale.model.TicketAvailableAction;
import com.shop.platform.aftersale.model.TicketStatus;
import com.shop.platform.aftersale.model.TicketType;
import com.shop.platform.common.Money;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 售后单出参 —— 买家侧与卖家侧共用：字段本就互为镜像，资金态在 payment，这里只有口径与时刻。
 *
 * <p>{@link #availableActions} 是<b>当前视角</b>的可执行动作集（买家端点给买家口径、卖家端点给卖家口径，
 * 与订单侧 availableActions 同款约定）：按钮组只吃这一个字段，不再按状态在前端复刻转移表。
 *
 * <p>{@link #returnAddress} 与 {@link #rejectReason} 只在<b>买家售后详情</b>（GET /orders/{id}/after-sales）回填：
 * 前者查询时经 shop :: api 实时解析本店默认退货地址，折成「收件人 电话 · 地址行」一行串（null = 卖家未配，
 * 前端引导联系客服）；后者是被拒时卖家填的理由（null = 本单没被拒过），真相在 ticket_events 的时间线那行 note。
 * 列表与其余端点不下发（避免逐行跨 schema 解析），恒为 null。
 */
@Schema(name = "TicketResponse")
public record TicketView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID orderId,
        @Schema(requiredMode = REQUIRED) TicketType type,
        @Schema(requiredMode = REQUIRED) TicketStatus status,
        @Schema(requiredMode = REQUIRED) List<TicketAvailableAction> availableActions,
        @Schema(requiredMode = REQUIRED, nullable = true) AfterSaleReason reasonCode,
        @Schema(requiredMode = REQUIRED, nullable = true) String reason,
        /** 无理由强制单（AFS-45）：申请瞬间定格，卖家不可拒绝。买家侧读它是「为什么这单卖家拒不了」的说明 */
        @Schema(requiredMode = REQUIRED) boolean noReasonEnforced,
        @Schema(requiredMode = REQUIRED, nullable = true) Money refundAmount,
        @Schema(requiredMode = REQUIRED, nullable = true) String returnLogisticsCompany,
        @Schema(requiredMode = REQUIRED, nullable = true) String returnTrackingNo,
        @Schema(description = "买家回寄地址（仅买家详情下发，查询时实时解析；null = 卖家未配默认退货地址）", nullable = true) String returnAddress,
        @Schema(description = "卖家拒绝理由（仅买家详情下发，取自拒绝动作的时间线 note；null = 本单未被拒绝）", nullable = true) String rejectReason,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime refundedAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static TicketView from(Ticket t, List<TicketAvailableAction> availableActions) {
        return from(t, availableActions, null);
    }

    /** detail = 买家详情独有两项（回寄地址、拒绝理由），由 service 查询时解析；其余构造路径传 null */
    public static TicketView from(Ticket t, List<TicketAvailableAction> availableActions, BuyerTicketDetail detail) {
        return new TicketView(
                t.getId(),
                t.getOrderId(),
                t.getType(),
                t.getStatus(),
                availableActions,
                t.getReasonCode(),
                t.getReason(),
                t.isNoReasonEnforced(),
                t.refundAmountAsMoney(),
                t.getReturnLogisticsCompany(),
                t.getReturnTrackingNo(),
                detail == null ? null : detail.returnAddress(),
                detail == null ? null : detail.rejectReason(),
                t.getRefundedAt(),
                t.getCreatedAt(),
                t.getUpdatedAt());
    }
}
