package com.shop.platform.payment.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * 合并支付发起入参：一次多店结算的 N 张单按 checkout_key 归为一批，整批一起发起。
 * 订单由 JWT 买家身份 + checkout_key 归属校验圈定，前端只报批次不报价、不报单号。
 */
public record CreateCheckoutPaymentRequest(@NotNull UUID checkoutKey) {}
