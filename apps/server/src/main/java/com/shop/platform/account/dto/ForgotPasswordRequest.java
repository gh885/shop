package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** 发送找回密码验证码入参。 */
public record ForgotPasswordRequest(
        @NotBlank @Pattern(regexp = "^1[0-9]{10}$", message = "手机号格式不正确") String phone,
        @NotBlank String captchaId,
        @NotBlank String captchaCode) {}
