package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank @Size(max = 50) String employeeNo,
        @NotBlank @Size(min = 8, max = 72) String password,
        @NotBlank @Size(max = 100) String deviceId) {
    public LoginRequest {
        if (employeeNo != null) employeeNo = employeeNo.trim();
    }
}
