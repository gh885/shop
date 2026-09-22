package com.shop.platform.aftersale.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

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
 * 卖家售后工作台的一行：售后单本体 + 订单摘要。
 *
 * <p>订单摘要（订单号/买家/商品）经 order :: api 只读点查后内存拼装，不是本模块的列——
 * 售后单只认 orderId，展示要用的那几样向 owning 模块要（跨 schema 不 JOIN）。
 *
 * <p>本 record 即 HTTP 出参（无独立 Response 镜像）：字段只减不增，改动等于改接口。
 * 不含支付流水号等资金细节：资金态在 payment，工作台要的是「该不该同意」而不是对账。
 */
public record SellerTicketItem(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID orderId,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) String receiverName,
        @Schema(requiredMode = REQUIRED) long itemCount,
        /** 行项快照名（首行）：订单必有行项，故非空 */
        @Schema(requiredMode = REQUIRED) String firstItemName,
        @Schema(requiredMode = REQUIRED) TicketType type,
        @Schema(requiredMode = REQUIRED) TicketStatus status,
        /** 卖家视角当前可执行动作（C5b 下发）：行内按钮只吃这个字段，不在前端按状态推导 */
        @Schema(requiredMode = REQUIRED) List<TicketAvailableAction> availableActions,
        /** 买家申请原因枚举（判定依据）；V63 前的历史单为 null */
        @Schema(requiredMode = REQUIRED, nullable = true) AfterSaleReason reasonCode,
        /** 买家补充说明：选填，未填为空 */
        @Schema(requiredMode = REQUIRED, nullable = true) String reason,
        /** 无理由强制单（AFS-45）：卖家不可拒绝。随 availableActions 一起下发是为了有话可说——按钮不见了要能解释为什么 */
        @Schema(requiredMode = REQUIRED) boolean noReasonEnforced,
        /** 退款口径：申请时定格为整单实付；历史/脏数据下可能为空 */
        @Schema(requiredMode = REQUIRED, nullable = true) Money refundAmount,
        /** 退货物流（仅退货退款且买家已回寄后有值） */
        @Schema(requiredMode = REQUIRED, nullable = true) String returnLogisticsCompany,
        @Schema(requiredMode = REQUIRED, nullable = true) String returnTrackingNo,
        /** 退款完成时刻（仅 REFUNDED 后有值） */
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime refundedAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {}
