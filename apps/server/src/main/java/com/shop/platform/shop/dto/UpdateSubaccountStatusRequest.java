package com.shop.platform.shop.dto;

import jakarta.validation.constraints.NotNull;

/**
 * 店主停用 / 启用子账号。
 *
 * <p>语义是「能不能用」而不是「目标状态是哪一档」，因为启用是<b>有条件</b>的：从没验过号的行启用后回到
 * 「待激活」，只有验过号的行才回 ACTIVE（不能让「启用」成为绕过手机验证的后门）。客户端说「我要它可用」，
 * 具体落到哪一档由服务端按那行的验号事实决定。
 */
public record UpdateSubaccountStatusRequest(@NotNull Boolean enabled) {}
