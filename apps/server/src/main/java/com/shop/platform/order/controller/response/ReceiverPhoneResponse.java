package com.shop.platform.order.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 收件人电话明文：卖家侧所有列表/详情出参都是掩码，明文只从这一跳逐单取，取用即留痕（ORD-62）。
 * 单独一个出参形状而不是塞进详情，是为了让「看明文」在契约上就是一个动作。
 */
public record ReceiverPhoneResponse(@Schema(requiredMode = REQUIRED, description = "买家收件人电话明文（未掩码）") String phone) {}
