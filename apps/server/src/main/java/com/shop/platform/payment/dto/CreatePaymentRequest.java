package com.shop.platform.payment.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * 发起支付入参：一次结算 = 一张主订单。支付由 JWT 买家身份 + service 归属校验圈定，
 * 前端只报主订单，不报价、不报子订单。
 */
public record CreatePaymentRequest(@NotNull UUID tradeId) {}
