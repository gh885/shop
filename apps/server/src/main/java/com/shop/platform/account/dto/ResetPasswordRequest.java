package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @NotBlank @Size(min = AccountFieldRules.PHONE_MIN, max = AccountFieldRules.PHONE_MAX) String phone,
        @NotBlank @Size(min = AccountFieldRules.SMS_CODE_LENGTH, max = AccountFieldRules.SMS_CODE_LENGTH) String code,
        @NotBlank @Size(min = AccountFieldRules.PASSWORD_MIN, max = AccountFieldRules.PASSWORD_MAX)
                String newPassword) {
    public ResetPasswordRequest {
        if (phone != null) phone = phone.trim();
    }
}
