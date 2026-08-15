package com.shop.platform.auth.dto;

import jakarta.validation.constraints.Size;

public record RefreshRequest(@Size(max = 200) String refreshToken, @Size(max = 100) String deviceId) {}
