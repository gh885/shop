package com.shop.platform.shop.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.shop.service.ShopInviteItem;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 邀请列表项出参：镜像 service 的 ShopInviteItem，字段只减不增 */
public record ShopInviteItemResponse(
        @Schema(requiredMode = REQUIRED) UUID memberId,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED) String shopName,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {

    public static ShopInviteItemResponse from(ShopInviteItem item) {
        return new ShopInviteItemResponse(item.memberId(), item.shopId(), item.shopName(), item.createdAt());
    }
}
