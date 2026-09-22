package com.shop.platform.aftersale.dto;

import com.shop.platform.aftersale.model.AfterSaleReason;
import com.shop.platform.aftersale.model.TicketType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 申请售后入参。type 直接声明为枚举：非法值由消息转换器挡在 400，不必在 service 里手写解析。
 *
 * <p>reasonCode 是<b>必选</b>的原因枚举（AFS-10）：判定「买家主张的是哪一种权利」全靠它——七天无理由强制
 * 只认 {@link AfterSaleReason#NO_REASON}，一段自由文本里读不出这个结论。reason 退为补充说明（可空），
 * 它给人看、不参与判定。
 */
public record ApplyAfterSaleRequest(
        @NotNull TicketType type,
        @NotNull(message = "请选择售后原因") AfterSaleReason reasonCode,
        @Size(max = 200, message = "补充说明最长 200 字") String reason) {}
