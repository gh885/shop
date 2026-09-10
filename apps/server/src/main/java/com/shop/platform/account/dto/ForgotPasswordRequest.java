package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ForgotPasswordRequest(@NotBlank @Size(min = 7, max = 20) String phone) {
    public ForgotPasswordRequest {
        if (phone != null) phone = phone.trim();
    }
}
