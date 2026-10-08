package com.shop.platform.account.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record UpdateLocalePreferenceRequest(
        @NotNull @Schema(description = "预期的当前账号 ID，用于阻止账号切换后的旧请求") UUID expectedAccountId,
        @NotBlank String preferredLocale) {}
