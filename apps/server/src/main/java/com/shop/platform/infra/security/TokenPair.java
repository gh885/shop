package com.shop.platform.infra.security;

/** 一对签发的令牌：access token + refresh token。供 auth / admin 模块共用。 */
public record TokenPair(String accessToken, String refreshToken) {}
