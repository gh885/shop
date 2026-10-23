package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 首次设置/修改密码。currentPassword 可空：短信注册的账号第一次设密时没有「当前密码」可验，
 * 是否需要它由 service 按库里有没有密码哈希裁决，入口不做形状推断。
 */
public record SetPasswordRequest(String currentPassword, @NotBlank @Size(min = 8, max = 64) String newPassword) {}
