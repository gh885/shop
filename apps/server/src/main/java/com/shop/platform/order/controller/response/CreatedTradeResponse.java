package com.shop.platform.order.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.order.service.CreatedTradeView;
import io.swagger.v3.oas.annotations.media.Schema;

/** 创建结果：一张主订单 + 其下拆出的子订单，payExpireAt 供前端倒计时 */
public record CreatedTradeResponse(@Schema(requiredMode = REQUIRED) CreatedTradeView trade) {}
