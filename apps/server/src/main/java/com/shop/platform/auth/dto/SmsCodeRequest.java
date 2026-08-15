package com.shop.platform.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SmsCodeRequest(@NotBlank @Size(min = 7, max = 20) String phone) {
    public SmsCodeRequest {
        if (phone != null) phone = phone.trim();
    }
}
