package com.shop.platform.auth.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.auth.mapper.User;
import com.shop.platform.common.PhoneNumber;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/** 当前登录用户信息（手机号已脱敏） */
public record MeResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String phone,
        @Schema(requiredMode = REQUIRED, nullable = true) String nickname,
        @Schema(requiredMode = REQUIRED, nullable = true) String avatarKey) {

    public static MeResponse from(User user) {
        return new MeResponse(user.getId(), PhoneNumber.mask(user.getPhone()), user.getNickname(), user.getAvatarKey());
    }
}
