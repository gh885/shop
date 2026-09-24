package com.shop.platform.account.dto;

import jakarta.validation.constraints.Size;

public record RefreshRequest(
        @Size(max = AccountFieldRules.REFRESH_TOKEN_MAX) String refreshToken,
        @Size(max = AccountFieldRules.DEVICE_ID_MAX) String deviceId) {}
