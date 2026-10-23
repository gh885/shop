package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** 发送登录短信验证码入参。图形验证码是发码的第一道防线（ACC 口径：廉价凭证先失败）。 */
public record SmsCodeRequest(
        @NotBlank @Pattern(regexp = "^1[0-9]{10}$", message = "手机号格式不正确") String phone,
        @NotBlank String captchaId,
        @NotBlank String captchaCode) {}
