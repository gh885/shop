package com.shop.platform.seller.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 登录入参。按 module-map 第 8.4 节，请求形状住 dto/，controller 只做转发。 */
public record SellerLoginRequest(
        @NotBlank String loginName, @NotBlank String password, @Size(max = 64) String deviceId) {}
