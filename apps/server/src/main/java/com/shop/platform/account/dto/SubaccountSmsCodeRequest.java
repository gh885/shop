package com.shop.platform.account.dto;

import com.shop.platform.account.api.SubaccountFieldRules;
import com.shop.platform.common.PhoneNumber;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 子账号激活码请求：登录名 + 本人手机号 + 人机验证。
 *
 * <p>phone 走强校验（仅大陆手机号）且必须与该登录名名下那一行登记的号码一致（一致性判定在 service）：
 * 本端点触发真实发短信，不能对任意字符串发真短信；人机验证是匿名发码入口的既定前置防线（ACC-35）。
 */
public record SubaccountSmsCodeRequest(
        @NotBlank
                @Size(min = SubaccountFieldRules.LOGIN_NAME_MIN, max = SubaccountFieldRules.LOGIN_NAME_MAX)
                @Pattern(
                        regexp = SubaccountFieldRules.LOGIN_NAME_PATTERN,
                        message = SubaccountFieldRules.LOGIN_NAME_PATTERN_MESSAGE)
                String loginName,
        @NotBlank @Pattern(regexp = PhoneNumber.CHINA_MOBILE_PATTERN, message = "手机号格式不正确") String phone,
        @NotBlank String captchaId,
        @NotBlank @Size(min = 1, max = AccountFieldRules.CAPTCHA_CODE_MAX) String captchaCode) {

    public SubaccountSmsCodeRequest {
        if (loginName != null) loginName = loginName.trim();
        if (phone != null) phone = phone.trim();
        if (captchaId != null) captchaId = captchaId.trim();
        if (captchaCode != null) captchaCode = captchaCode.trim();
    }
}
