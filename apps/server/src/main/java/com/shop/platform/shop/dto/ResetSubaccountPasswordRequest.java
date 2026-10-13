package com.shop.platform.shop.dto;

import com.shop.platform.account.api.SubaccountFieldRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 店主重置子账号口令（子账号没有短信自助找回通道）；成功即吊销该子账号全部设备的会话 */
public record ResetSubaccountPasswordRequest(
        @NotBlank @Size(min = SubaccountFieldRules.PASSWORD_MIN, max = SubaccountFieldRules.PASSWORD_MAX)
                String password) {}
