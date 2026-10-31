package com.shop.platform.staff.dto;

import jakarta.validation.constraints.NotBlank;

/** 平台员工登录入参。 */
public record StaffLoginRequest(
        @NotBlank String loginName,
        @NotBlank String password,
        @jakarta.validation.constraints.Size(max = 64) String deviceId) {}
