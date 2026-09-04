package com.shop.platform.shop.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import com.shop.platform.shop.service.ShopMemberItem;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/** 成员列表项出参：镜像 service 的 ShopMemberItem（含跨 schema 拼装的手机号 + 权限码），字段只减不增 */
public record ShopMemberItemResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID memberId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID userId,
        @Schema(requiredMode = REQUIRED, nullable = true) String phone,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) MemberRole role,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) MemberStatus status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<String> permissions) {

    public static ShopMemberItemResponse from(ShopMemberItem item) {
        return new ShopMemberItemResponse(
                item.memberId(), item.userId(), item.phone(), item.role(), item.status(), item.permissions());
    }
}
