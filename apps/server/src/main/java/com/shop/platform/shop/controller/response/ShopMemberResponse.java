package com.shop.platform.shop.controller.response;

import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** 成员出参：invite/accept 返回，前端 ShopMemberSchema 逐字段校验；permissions 为被授予码（OWNER 空集） */
public record ShopMemberResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID shopId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID userId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) MemberRole role,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) MemberStatus status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<String> permissions,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime updatedAt) {

    public static ShopMemberResponse from(ShopMember member) {
        return new ShopMemberResponse(
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
