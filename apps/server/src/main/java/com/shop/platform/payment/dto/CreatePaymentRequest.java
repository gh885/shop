package com.shop.platform.payment.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** 发起支付入参：订单由 JWT 买家身份 + service 归属校验圈定，前端只报单不报价 */
public record CreatePaymentRequest(@NotNull UUID orderId) {}
