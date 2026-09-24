package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LogoutRequest(@NotBlank @Size(max = AccountFieldRules.DEVICE_ID_MAX) String deviceId) {}
