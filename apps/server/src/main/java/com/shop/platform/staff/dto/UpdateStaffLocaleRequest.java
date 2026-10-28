package com.shop.platform.staff.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 平台员工改语言偏好。与买家、卖家同形状——同一件事，主体不同，故各模块一份。
 *
 * @param expectedAccountId 客户端以为自己在改谁；与令牌不一致回 409，防「切换账号后误写」
 */
public record UpdateStaffLocaleRequest(
        @NotBlank @Size(max = 35) String preferredLocale, @NotBlank String expectedAccountId) {}
