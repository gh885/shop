package com.shop.platform.shop.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** 成员邀请/接受动作的 HTTP 读模型，不把 ShopMember 实体直接暴露给响应层。 */
@Schema(name = "ShopMemberResponse")
public record ShopMemberView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED) UUID userId,
        @Schema(requiredMode = REQUIRED) MemberRole role,
        @Schema(requiredMode = REQUIRED) MemberStatus status,
        @Schema(requiredMode = REQUIRED) List<String> permissions,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static ShopMemberView from(ShopMember member) {
        return new ShopMemberView(
                member.getId(),
                member.getShopId(),
                member.getUserId(),
                member.getRole(),
                member.getStatus(),
                member.getPermissions(),
                member.getCreatedAt(),
                member.getUpdatedAt());
    }
}
