package com.shop.platform.seller.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 注册入参。主账号登录名禁用冒号：子账号登录名是「主账号:后缀」的前缀形态，
 * 主账号自己带冒号会让前缀规则出现第二种解析。
 */
public record SellerRegisterRequest(
        @NotBlank @Size(max = 40) String name,
        @NotBlank @Size(min = 3, max = 30) @Pattern(regexp = "[a-zA-Z0-9_-]+", message = "登录名只能含字母、数字、下划线和连字符")
                String loginName,
        @NotBlank @Size(max = 72) String password) {}
