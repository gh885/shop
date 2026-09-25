package com.shop.platform.account.dto;

import com.shop.platform.common.PhoneNumber;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 发送重置密码验证码请求。本端点触发真实发短信，phone 走强校验（仅大陆手机号），口径同
 * {@link SmsCodeRequest}；登录族维持宽松。
 *
 * <p>人机验证两枚入参与 {@link SmsCodeRequest} 同形：本端点和它一样是匿名、按自报手机号发真短信的
 * 入口，只有号码频控时防线少一道（ACC-35 覆盖两个端点）。
 */
public record ForgotPasswordRequest(
        @NotBlank @Pattern(regexp = PhoneNumber.CHINA_MOBILE_PATTERN, message = "手机号格式不正确") String phone,
        @NotBlank String captchaId,
        @NotBlank @Size(min = 1, max = AccountFieldRules.CAPTCHA_CODE_MAX) String captchaCode) {
    public ForgotPasswordRequest {
        if (phone != null) phone = phone.trim();
        if (captchaCode != null) captchaCode = captchaCode.trim();
        if (captchaId != null) captchaId = captchaId.trim();
    }
}
