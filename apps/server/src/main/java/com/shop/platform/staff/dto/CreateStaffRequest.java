package com.shop.platform.staff.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 创建平台员工：登录名 + 初始口令 + 展示名 + 岗位。岗位是入参而非默认：创建时就想清楚「这个人要干什么」。 */
public record CreateStaffRequest(
        @NotBlank @Size(min = 4, max = 32) @Pattern(regexp = "^[A-Za-z0-9_.-]+$", message = "登录名只允许字母数字与 _ . -")
                String loginName,
        @NotBlank @Size(min = 8, max = 64) String password,
        @NotBlank @Size(max = 32) String displayName,
        @NotBlank @Pattern(regexp = "REVIEWER|OPS|SUPER_ADMIN", message = "岗位必须是 REVIEWER / OPS / SUPER_ADMIN")
                String role) {}
