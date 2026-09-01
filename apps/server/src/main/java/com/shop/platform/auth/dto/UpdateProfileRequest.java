package com.shop.platform.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 更新个人资料请求。nickname 必填；avatarKey 为对象存储 key：null＝不改，空串＝清空头像 */
public record UpdateProfileRequest(@NotBlank @Size(max = 30) String nickname, @Size(max = 255) String avatarKey) {}
