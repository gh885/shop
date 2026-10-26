package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * 平台侧改买家状态。
 *
 * <p>只收两个值。词表在 DTO 上卡一道（422，带字段级错误），service 再卡一道——
 * 后者是给将来的内部调用（批量处置）留的，那时没有 DTO。
 */
public record UpdateBuyerStatusRequest(
        @NotNull @Pattern(regexp = "active|disabled", message = "只能是 active 或 disabled") String status) {}
