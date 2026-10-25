package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 更新昵称。 */
public record UpdateProfileRequest(@NotBlank @Size(max = 32) String displayName) {}
