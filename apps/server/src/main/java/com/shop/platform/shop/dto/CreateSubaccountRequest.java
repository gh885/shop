package com.shop.platform.shop.dto;

import com.shop.platform.account.api.SubaccountFieldRules;
import com.shop.platform.common.PhoneNumber;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 店主建子账号：登录名 + 本人手机号 + 初始口令 + 可授予权限码。
 *
 * <p>手机号是<b>激活锚点</b>而不是联系方式：员工首次登录要用它收验证码（同店一个号只能绑一个子账号）。
 * 建号这一步不发短信——发码由员工自己在登录页触发，店主手里没有「给任意号码发短信」的能力。
 *
 * <p>登录名形状与员工工号同一取舍（只许字母数字下划线短横）：粘贴错一个空格就是「登录名明明对却登不上」。
 */
public record CreateSubaccountRequest(
        @NotBlank
                @Size(min = SubaccountFieldRules.LOGIN_NAME_MIN, max = SubaccountFieldRules.LOGIN_NAME_MAX)
                @Pattern(
                        regexp = SubaccountFieldRules.LOGIN_NAME_PATTERN,
                        message = SubaccountFieldRules.LOGIN_NAME_PATTERN_MESSAGE)
                String loginName,
        @NotBlank @Pattern(regexp = PhoneNumber.CHINA_MOBILE_PATTERN, message = "手机号格式不正确") String phone,
        @NotBlank @Size(min = SubaccountFieldRules.PASSWORD_MIN, max = SubaccountFieldRules.PASSWORD_MAX)
                String password,
        List<String> permissions) {

    public CreateSubaccountRequest {
        if (loginName != null) loginName = loginName.trim();
        if (phone != null) phone = phone.trim();
    }
}
