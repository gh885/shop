package com.shop.platform.account.dto;

import com.shop.platform.common.PhoneNumber;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * 发送重置密码验证码请求。本端点触发真实发短信，phone 走强校验（仅大陆手机号），口径同
 * {@link SmsCodeRequest}；登录族维持宽松。
 */
public record ForgotPasswordRequest(
        @NotBlank @Pattern(regexp = PhoneNumber.CHINA_MOBILE_PATTERN, message = "手机号格式不正确") String phone) {
    public ForgotPasswordRequest {
        if (phone != null) phone = phone.trim();
    }
}
