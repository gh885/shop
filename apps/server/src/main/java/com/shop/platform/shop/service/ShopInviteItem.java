package com.shop.platform.shop.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 待确认邀请（我的视角）：成员记录 ID + 店名。
 *
 * <p>本 record 即 HTTP 出参（无独立 Response 镜像）：字段只减不增，改动等于改接口。
 */
public record ShopInviteItem(
        @Schema(requiredMode = REQUIRED) UUID memberId,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED) String shopName,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {}
