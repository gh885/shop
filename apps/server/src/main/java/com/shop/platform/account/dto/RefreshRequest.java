package com.shop.platform.account.dto;

import jakarta.validation.constraints.Size;

public record RefreshRequest(@Size(max = 200) String refreshToken, @Size(max = 100) String deviceId) {}
