package com.shop.platform.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 更新个人资料请求（本期仅昵称；头像上传未做，不在此改） */
public record UpdateProfileRequest(@NotBlank @Size(max = 30) String nickname) {}
