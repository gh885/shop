package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank @Size(max = 50) String employeeNo,
        @NotBlank @Size(min = AccountFieldRules.PASSWORD_MIN, max = AccountFieldRules.PASSWORD_MAX) String password,
        @NotBlank @Size(max = AccountFieldRules.DEVICE_ID_MAX) String deviceId) {
    public LoginRequest {
        if (employeeNo != null) employeeNo = employeeNo.trim();
    }
}
