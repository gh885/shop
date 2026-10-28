package com.shop.platform.seller.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 卖家改语言偏好。与买家同形状（见 {@code account.dto.UpdateLocaleRequest}）——同一件事，
 * 但主体不同，所以各模块一份，不跨模块借 DTO。
 *
 * @param expectedAccountId 客户端以为自己在改谁；与令牌不一致回 409，防「切换账号后误写」
 */
public record UpdateSellerLocaleRequest(
        @NotBlank @Size(max = 35) String preferredLocale, @NotBlank String expectedAccountId) {}
