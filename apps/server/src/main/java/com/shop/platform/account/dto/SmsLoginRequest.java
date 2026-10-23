package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 短信验证码登录入参。deviceId 可空：无设备容器的客户端不传，缺省归哪个桶由
 * {@code RefreshTokenStore} 裁决，入口不翻译。
 */
public record SmsLoginRequest(
        @NotBlank @Pattern(regexp = "^1[0-9]{10}$", message = "手机号格式不正确") String phone,
        @NotBlank @Size(min = 6, max = 6) String code,
        @Size(max = 64) String deviceId) {}
