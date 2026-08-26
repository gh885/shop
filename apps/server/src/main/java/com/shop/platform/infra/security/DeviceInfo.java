package com.shop.platform.infra.security;

import java.time.OffsetDateTime;

/**
 * 一次登录的设备元数据（设备列表展示用）。
 *
 * <p>签发 refresh token 时随 `issue` 存入 Redis（见 {@link RefreshTokenStore#issue}），
 * 供 `GET /auth/devices` 列表展示：设备名（从 UA 解析）、登录 IP、最近活跃时间。
 */
public record DeviceInfo(String deviceName, String ip, OffsetDateTime lastLoginAt) {}
