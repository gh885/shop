package com.shop.platform.auth.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.infra.security.RefreshTokenStore;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;

/** 设备列表项：deviceId + 元数据（设备名/IP/最近活跃）+ 是否当前设备 */
public record DeviceEntryResponse(
        @Schema(requiredMode = REQUIRED) String deviceId,
        @Schema(requiredMode = REQUIRED, nullable = true) String deviceName,
        @Schema(requiredMode = REQUIRED, nullable = true) String ip,
        @Schema(requiredMode = REQUIRED) OffsetDateTime lastLoginAt,
        @Schema(requiredMode = REQUIRED) boolean isCurrent) {

    public static DeviceEntryResponse from(RefreshTokenStore.DeviceEntry entry, String currentDeviceId) {
        return new DeviceEntryResponse(
                entry.deviceId(),
                entry.info().deviceName(),
                entry.info().ip(),
                entry.info().lastLoginAt(),
                entry.deviceId().equals(currentDeviceId));
    }
}
