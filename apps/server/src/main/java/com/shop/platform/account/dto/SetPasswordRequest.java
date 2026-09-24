package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SetPasswordRequest(
        @Size(max = AccountFieldRules.PASSWORD_MAX) String currentPassword,
        @NotBlank @Size(min = AccountFieldRules.PASSWORD_MIN, max = AccountFieldRules.PASSWORD_MAX)
                String newPassword) {}
