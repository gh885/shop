package com.shop.platform.account.dto;

import com.shop.platform.common.AddressFieldRules;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.infra.region.RegionRegistry;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 收货地址入参：新增/修改复用。isDefault 为 null 时修改场景保持原值、新增场景视为 false */
public record AddressRequest(
        @NotBlank @Size(max = AddressFieldRules.NAME_MAX) String receiverName,
        @NotBlank @Pattern(regexp = PhoneNumber.CONTACT_PATTERN, message = "手机号格式不正确") String phone,
        /** 形状门（6 位数字）；是不是真有这么个区划，由 service 拿 {@link RegionRegistry} 判，两处同为 400 */
        @NotBlank @Pattern(regexp = RegionRegistry.CODE_PATTERN, message = "行政区划代码格式不正确") String regionCode,
        @NotBlank @Size(max = AddressFieldRules.NAME_MAX) String province,
        @NotBlank @Size(max = AddressFieldRules.NAME_MAX) String city,
        @NotBlank @Size(max = AddressFieldRules.NAME_MAX) String district,
        @NotBlank @Size(max = AddressFieldRules.DETAIL_MAX) String detail,
        @Size(max = AddressFieldRules.LABEL_MAX) String label,
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
