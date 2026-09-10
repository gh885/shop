package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @NotBlank @Size(min = 7, max = 20) String phone,
        @NotBlank @Size(min = 6, max = 6) String code,
        @NotBlank @Size(min = 8, max = 72) String newPassword) {
    public ResetPasswordRequest {
        if (phone != null) phone = phone.trim();
    }
}
