package com.shop.platform.cart.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.cart.service.CartCount;
import io.swagger.v3.oas.annotations.media.Schema;

/** 角标计数出参：镜像 service 的 CartCount，字段只减不增 */
public record CartCountResponse(
        @Schema(requiredMode = REQUIRED) long total, @Schema(requiredMode = REQUIRED) long selected) {

    public static CartCountResponse from(CartCount count) {
        return new CartCountResponse(count.total(), count.selected());
    }
}
