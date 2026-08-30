package com.shop.platform.order.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 买家回寄退货入参：物流公司 + 运单号（仅退货退款路径，处于 RETURNING 时可填）。 */
public record ReturnGoodsRequest(
        @NotBlank @Size(max = 32) String logisticsCompany, @NotBlank @Size(max = 64) String trackingNo) {}
