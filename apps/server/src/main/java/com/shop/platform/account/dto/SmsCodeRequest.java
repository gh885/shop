package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 发送短信验证码请求：手机号 + 人机验证（captchaId + captchaCode）。
 * 人机验证码为发码前置防线（见 account.infra.CaptchaService），必须携带。
 */
public record SmsCodeRequest(
        @NotBlank @Size(min = 7, max = 20) String phone,
        @NotBlank String captchaId,
        @NotBlank @Size(min = 1, max = 10) String captchaCode) {
    public SmsCodeRequest {
        if (phone != null) phone = phone.trim();
        if (captchaCode != null) captchaCode = captchaCode.trim();
        if (captchaId != null) captchaId = captchaId.trim();
    }
}
