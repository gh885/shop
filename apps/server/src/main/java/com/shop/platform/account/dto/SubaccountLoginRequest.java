package com.shop.platform.account.dto;

import com.shop.platform.account.api.SubaccountFieldRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 子账号口令登录请求：登录名 + 口令（无手机号——工作身份不走短信登录，激活之后登录只认口令）。
 *
 * <p>口令那一格与买家登录同档（同一份常量）：同一个「太短的密码」在两条入口给出两种结果，
 * 是这套口径最容易长出来的第二种答案。
 */
public record SubaccountLoginRequest(
        @NotBlank @Size(min = SubaccountFieldRules.LOGIN_NAME_MIN, max = SubaccountFieldRules.LOGIN_NAME_MAX)
                String loginName,
        @NotBlank @Size(min = SubaccountFieldRules.PASSWORD_MIN, max = SubaccountFieldRules.PASSWORD_MAX)
                String password,
        @NotBlank @Size(max = AccountFieldRules.DEVICE_ID_MAX) String deviceId) {

    public SubaccountLoginRequest {
        if (loginName != null) loginName = loginName.trim();
    }
}
