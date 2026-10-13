package com.shop.platform.account.dto;

import com.shop.platform.account.api.SubaccountFieldRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 子账号自助改密：需当前口令（没有短信自助找回那一格——忘了找店主重置） */
public record SubaccountChangePasswordRequest(
        @NotBlank @Size(max = SubaccountFieldRules.PASSWORD_MAX) String currentPassword,
        @NotBlank @Size(min = SubaccountFieldRules.PASSWORD_MIN, max = SubaccountFieldRules.PASSWORD_MAX)
                String newPassword) {}
