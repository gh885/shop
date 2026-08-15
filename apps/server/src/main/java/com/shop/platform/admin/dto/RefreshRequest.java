package com.shop.platform.admin.dto;

import jakarta.validation.constraints.Size;

public record RefreshRequest(@Size(max = 100) String deviceId) {}
