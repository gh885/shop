package com.shop.platform.shop.dto;

import com.shop.platform.common.PhoneNumber;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record InviteMemberRequest(
        @NotBlank @Pattern(regexp = PhoneNumber.CHINA_MOBILE_PATTERN, message = "手机号格式不正确") String phone) {
    public InviteMemberRequest {
        if (phone != null) phone = phone.trim();
    }
}
