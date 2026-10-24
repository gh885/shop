package com.shop.platform.account.service;

import com.shop.platform.account.mapper.AddressEntity;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 买家地址读模型，直接作 HTTP 出参。
 *
 * <p>三段码由 regionCode 派生（国标 6 位码前 2 位省、前 4 位市、全 6 位区县）——
 * 算价与落单要的是码不是名称，派生放在读侧，调用方不用自己拆。
 */
public record AddressView(
        UUID id,
        String receiverName,
        String phone,
        String regionCode,
        String province,
        String city,
        String district,
        String detail,
        String label,
        boolean isDefault,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {

    public String provinceCode() {
        return regionCode.substring(0, 2);
    }

    public String cityCode() {
        return regionCode.substring(0, 4);
    }

    public String districtCode() {
        return regionCode;
    }

    public static AddressView from(AddressEntity row) {
        return new AddressView(
                row.getId(),
                row.getReceiverName(),
                row.getPhone(),
                row.getRegionCode(),
                row.getProvince(),
                row.getCity(),
                row.getDistrict(),
                row.getDetail(),
                row.getLabel(),
                row.getIsDefault(),
                row.getCreatedAt(),
                row.getUpdatedAt());
    }
}
