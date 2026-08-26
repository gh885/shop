package com.shop.platform.shop.dto;

import com.shop.platform.common.PhoneNumber;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.List;

/** 店主邀请成员：手机号定位 + 可选权限勾选（白名单校验在 SellerGrants，默认空集） */
public record InviteMemberRequest(
        @NotBlank @Pattern(regexp = PhoneNumber.CHINA_MOBILE_PATTERN, message = "手机号格式不正确") String phone,
        List<String> permissions) {
    public InviteMemberRequest {
        if (phone != null) phone = phone.trim();
    }
}
