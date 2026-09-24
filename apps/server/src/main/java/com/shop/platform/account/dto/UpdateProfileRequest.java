package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 更新个人资料请求。nickname 必填；avatarKey 为对象存储 key：null＝不改，空串＝清空头像 */
public record UpdateProfileRequest(
        @NotBlank @Size(max = AccountFieldRules.NICKNAME_MAX) String nickname,
        @Size(max = AccountFieldRules.AVATAR_KEY_MAX) String avatarKey) {}
