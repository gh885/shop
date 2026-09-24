package com.shop.platform.account.dto;

import com.shop.platform.common.PhoneNumber;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 发送短信验证码请求：手机号 + 人机验证（captchaId + captchaCode）。
 * 人机验证码为发码前置防线，必须携带。
 *
 * <p>phone 走强校验（仅大陆手机号）：本端点触发真实发短信，不能对任意 7–20 字符串发真短信；
 * 登录族（{@link SmsLoginRequest}）不在此列，维持宽松长度校验（历史数据/海外号可登录）。
 */
public record SmsCodeRequest(
        @NotBlank @Pattern(regexp = PhoneNumber.CHINA_MOBILE_PATTERN, message = "手机号格式不正确") String phone,
        @NotBlank String captchaId,
        @NotBlank @Size(min = 1, max = AccountFieldRules.CAPTCHA_CODE_MAX) String captchaCode) {
    public SmsCodeRequest {
        if (phone != null) phone = phone.trim();
        if (captchaCode != null) captchaCode = captchaCode.trim();
        if (captchaId != null) captchaId = captchaId.trim();
    }
}
