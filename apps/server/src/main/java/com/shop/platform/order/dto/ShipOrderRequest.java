package com.shop.platform.order.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 卖家发货入参：物流公司 + 运单号，一单一包裹 */
public record ShipOrderRequest(
        @NotBlank(message = "物流公司不能为空") @Size(max = 50) String logisticsCompany,
        @NotBlank(message = "运单号不能为空") @Size(max = 64) String trackingNo) {}
