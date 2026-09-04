package com.shop.platform.admin.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.admin.service.StaffInfo;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/** 员工信息出参：镜像 service 的 StaffInfo，字段只减不增 */
public record StaffInfoResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String employeeNo,
        @Schema(requiredMode = REQUIRED, nullable = true) String displayName,
        @Schema(requiredMode = REQUIRED, nullable = true) String role,
        @Schema(requiredMode = REQUIRED) List<String> permissions) {

    public static StaffInfoResponse from(StaffInfo info) {
        return new StaffInfoResponse(info.id(), info.employeeNo(), info.displayName(), info.role(), info.permissions());
    }
}
