package com.shop.platform.shop.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/**
 * 成员列表项：含跨 schema 拼装的手机号 + 被授予的权限码（OWNER 为空集，全权由角色判定）。
 *
 * <p>本 record 即 HTTP 出参（无独立 Response 镜像）：字段只减不增，改动等于改接口。
 */
public record ShopMemberItem(
        @Schema(requiredMode = REQUIRED) UUID memberId,
        @Schema(requiredMode = REQUIRED) UUID userId,
        /** 本人那行是明文，其余成员是掩码（前 3 后 4）：看别人的号走 {@code POST /shops/{shopId}/members/{memberId}/phone} 逐条索取并留痕 */
        @Schema(
                        requiredMode = REQUIRED,
                        nullable = true,
                        description = "成员手机号：本人明文，他人掩码（前 3 后 4），"
                                + "他人明文需 POST /shops/{shopId}/members/{memberId}/phone 逐条索取")
                String phone,
        @Schema(requiredMode = REQUIRED) MemberRole role,
        @Schema(requiredMode = REQUIRED) MemberStatus status,
        @Schema(requiredMode = REQUIRED) List<String> permissions) {}
