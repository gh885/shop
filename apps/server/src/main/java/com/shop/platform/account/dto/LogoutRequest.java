package com.shop.platform.account.dto;

import jakarta.validation.constraints.Size;

/** 登出请求体：只带要登出的设备；refresh token 在 cookie 里。deviceId 可空（归 default 桶）。 */
public record LogoutRequest(@Size(max = 64) String deviceId) {}
