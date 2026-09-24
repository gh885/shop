package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * 注销申请入参：只有一枚发到绑定手机号的一次性验证码。
 *
 * <p>不带 phone——号码由 token 背后的账号决定，接受自报号码等于给「拿别人号码试一把」开门；
 * 也不带密码：短信自动注册的账号本来就可能从未设密码（ACC-38），密码不能作为通用凭证。
 */
public record ConfirmDeletionRequest(
        @NotBlank
                @Pattern(
                        regexp = AccountFieldRules.SMS_CODE_PATTERN,
                        message = "验证码为 " + AccountFieldRules.SMS_CODE_LENGTH + " 位数字")
                String code) {}
