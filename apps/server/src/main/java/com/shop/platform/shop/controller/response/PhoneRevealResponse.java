package com.shop.platform.shop.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 手机号明文：批量出参一律掩码，明文只从「逐条索取号码」那一跳出（店主号与成员号共用这个形状）。
 * 单独一个出参形状而不是塞进列表，是为了让「看明文」在契约上就是一个动作，每次取用打业务事件留痕。
 */
public record PhoneRevealResponse(@Schema(requiredMode = REQUIRED, description = "手机号明文（未掩码）") String phone) {}
