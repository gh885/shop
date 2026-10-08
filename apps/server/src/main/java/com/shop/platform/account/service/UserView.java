package com.shop.platform.account.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.account.mapper.User;
import com.shop.platform.common.PhoneNumber;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/** 当前用户资料读模型：手机号在 service 出参边界完成脱敏。 */
@Schema(name = "MeResponse")
public record UserView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String phone,
        @Schema(requiredMode = REQUIRED, nullable = true) String nickname,
        @Schema(requiredMode = REQUIRED, nullable = true) String avatarKey,
        @Schema(requiredMode = REQUIRED, nullable = true) String preferredLocale) {

    public static UserView from(User user) {
        return new UserView(
                user.getId(),
                PhoneNumber.mask(user.getPhone()),
                user.getNickname(),
                user.getAvatarKey(),
                user.getPreferredLocale());
    }
}
