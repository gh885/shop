package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SetPasswordRequest(
        @Size(max = 72) String currentPassword, @NotBlank @Size(min = 8, max = 72) String newPassword) {}
