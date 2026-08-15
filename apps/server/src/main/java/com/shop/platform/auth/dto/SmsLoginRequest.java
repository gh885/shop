package com.shop.platform.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SmsLoginRequest(
        @NotBlank @Size(min = 7, max = 20) String phone,
        @NotBlank @Size(min = 6, max = 6) String code,
        @NotBlank @Size(max = 100) String deviceId) {
    public SmsLoginRequest {
        if (phone != null) phone = phone.trim();
    }
}
