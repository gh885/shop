package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasswordLoginRequest(
        @NotBlank @Size(min = 7, max = 20) String phone,
        @NotBlank @Size(min = 8, max = 72) String password,
        @NotBlank @Size(max = 100) String deviceId) {
    public PasswordLoginRequest {
        if (phone != null) phone = phone.trim();
    }
}
