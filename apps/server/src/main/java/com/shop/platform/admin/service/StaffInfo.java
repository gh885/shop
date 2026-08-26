package com.shop.platform.admin.service;

import java.util.UUID;

/** 员工信息（me 出参的 service 形状）：role 为岗位枚举名，permissions 为展开后的具体权限码 */
public record StaffInfo(
        UUID id, String employeeNo, String displayName, String role, java.util.List<String> permissions) {}
