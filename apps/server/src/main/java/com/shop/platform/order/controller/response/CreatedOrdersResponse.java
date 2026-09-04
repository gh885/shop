package com.shop.platform.order.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/** 创建结果：拆出的全部新单，payExpireAt 供前端倒计时 */
public record CreatedOrdersResponse(@Schema(requiredMode = REQUIRED) List<CreatedOrder> orders) {}
