package com.shop.platform.infra.security;

/**
 * 登录设备的元数据：设备名（UA 解析）、登录 IP、最近活跃时刻。列表展示用。
 *
 * @param ip 可空：匿名入口拿不到或没采集时不写
 */
public record DeviceInfo(String deviceName, String ip, java.time.OffsetDateTime lastLoginAt) {}
