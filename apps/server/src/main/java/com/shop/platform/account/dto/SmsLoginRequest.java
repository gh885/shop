package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SmsLoginRequest(
        @NotBlank @Size(min = AccountFieldRules.PHONE_MIN, max = AccountFieldRules.PHONE_MAX) String phone,
        @NotBlank @Size(min = AccountFieldRules.SMS_CODE_LENGTH, max = AccountFieldRules.SMS_CODE_LENGTH) String code,
        @NotBlank @Size(max = AccountFieldRules.DEVICE_ID_MAX) String deviceId) {
    public SmsLoginRequest {
        if (phone != null) phone = phone.trim();
    }
}
