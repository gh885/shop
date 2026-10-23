package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 提交注销申请：凭发送到本人手机号的注销验证码。 */
public record DeletionRequest(@NotBlank @Size(min = 6, max = 6) String code) {}
