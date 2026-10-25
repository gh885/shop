package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 买家注册入参。
 *
 * <p>手机号在这里就按 {@code 1[0-9]{10}} 卡：库里那条 {@code ck_buyer_phone} 是同一条规则的兜底，
 * 但撞约束报出来的是一句数据库错误，用户看不懂。
 */
public record BuyerRegisterRequest(
        @NotBlank @Pattern(regexp = "^1[0-9]{10}$", message = "手机号格式不正确") String phone,
        @NotBlank @Size(min = 8, max = 64) String password,
        @NotBlank @Size(max = 32) String displayName) {}
