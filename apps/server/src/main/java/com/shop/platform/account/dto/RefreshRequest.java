package com.shop.platform.account.dto;

/** 刷新请求体。deviceId 可空；refresh token 本体走 httpOnly cookie，不进请求体。 */
public record RefreshRequest(String deviceId) {}
