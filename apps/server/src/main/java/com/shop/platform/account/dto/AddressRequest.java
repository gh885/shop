package com.shop.platform.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 收货地址入参：新增/修改复用。isDefault 为 null 时修改场景保持原值、新增场景视为 false */
public record AddressRequest(
        @NotBlank @Size(max = 30) String receiverName,
        @NotBlank @Pattern(regexp = "^[0-9+\\-]{5,20}$", message = "手机号格式不正确") String phone,
        @NotBlank @Pattern(regexp = "^\\d{6}$", message = "行政区划代码格式不正确") String regionCode,
        @NotBlank @Size(max = 30) String province,
        @NotBlank @Size(max = 30) String city,
        @NotBlank @Size(max = 30) String district,
        @NotBlank @Size(max = 120) String detail,
        @Size(max = 20) String label,
        Boolean isDefault) {
    public AddressRequest {
        if (receiverName != null) receiverName = receiverName.trim();
        if (phone != null) phone = phone.trim();
        if (regionCode != null) regionCode = regionCode.trim();
        if (province != null) province = province.trim();
        if (city != null) city = city.trim();
        if (district != null) district = district.trim();
        if (detail != null) detail = detail.trim();
        if (label != null) label = label.trim();
    }
}
