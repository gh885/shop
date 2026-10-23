package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 找回密码：凭重置验证码设置新密码。 */
public record ResetPasswordRequest(
        @NotBlank @Pattern(regexp = "^1[0-9]{10}$", message = "手机号格式不正确") String phone,
        @NotBlank @Size(min = 6, max = 6) String code,
        @NotBlank @Size(min = 8, max = 64) String newPassword) {}
