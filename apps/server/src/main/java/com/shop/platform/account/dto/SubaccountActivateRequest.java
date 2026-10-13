package com.shop.platform.account.dto;

import com.shop.platform.account.api.SubaccountFieldRules;
import com.shop.platform.common.PhoneNumber;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 子账号激活请求（首次登录）：登录名 + 本人手机号 + 收到的验证码；成功即签发会话 */
public record SubaccountActivateRequest(
        @NotBlank
                @Size(min = SubaccountFieldRules.LOGIN_NAME_MIN, max = SubaccountFieldRules.LOGIN_NAME_MAX)
                @Pattern(
                        regexp = SubaccountFieldRules.LOGIN_NAME_PATTERN,
                        message = SubaccountFieldRules.LOGIN_NAME_PATTERN_MESSAGE)
                String loginName,
        @NotBlank @Pattern(regexp = PhoneNumber.CHINA_MOBILE_PATTERN, message = "手机号格式不正确") String phone,
        @NotBlank @Size(min = 1, max = AccountFieldRules.SMS_CODE_LENGTH) String code,
        @NotBlank @Size(max = AccountFieldRules.DEVICE_ID_MAX) String deviceId) {

    public SubaccountActivateRequest {
        if (loginName != null) loginName = loginName.trim();
        if (phone != null) phone = phone.trim();
        if (code != null) code = code.trim();
    }
}
