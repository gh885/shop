package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasswordLoginRequest(
        @NotBlank @Size(min = AccountFieldRules.PHONE_MIN, max = AccountFieldRules.PHONE_MAX) String phone,
        @NotBlank @Size(min = AccountFieldRules.PASSWORD_MIN, max = AccountFieldRules.PASSWORD_MAX) String password,
        @NotBlank @Size(max = AccountFieldRules.DEVICE_ID_MAX) String deviceId) {
    public PasswordLoginRequest {
        if (phone != null) phone = phone.trim();
    }
}
