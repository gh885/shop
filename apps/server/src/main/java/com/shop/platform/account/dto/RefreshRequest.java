package com.shop.platform.account.dto;

import jakarta.validation.constraints.Size;

public record RefreshRequest(
        @Size(max = 200) String refreshToken, @Size(max = AccountFieldRules.DEVICE_ID_MAX) String deviceId) {}
