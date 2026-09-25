package com.shop.platform.shop.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.shop.mapper.MerchantAddress;
import com.shop.platform.shop.model.AddressStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 商家地址读模型：过滤软删标记后作为 HTTP 出参。 */
@Schema(name = "MerchantAddressResponse")
public record MerchantAddressView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED) String contactName,
        @Schema(requiredMode = REQUIRED) String phone,
        @Schema(requiredMode = REQUIRED) String regionCode,
        @Schema(requiredMode = REQUIRED) String province,
        @Schema(requiredMode = REQUIRED) String city,
        @Schema(requiredMode = REQUIRED) String district,
        @Schema(requiredMode = REQUIRED) String detail,
        @Schema(requiredMode = REQUIRED, nullable = true) String postalCode,
        @Schema(requiredMode = REQUIRED, nullable = true) String companyName,
        @Schema(requiredMode = REQUIRED, nullable = true) String note,
        @Schema(requiredMode = REQUIRED) Boolean defaultShip,
        @Schema(requiredMode = REQUIRED) Boolean defaultReturn,
        @Schema(requiredMode = REQUIRED) AddressStatus status,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static MerchantAddressView from(MerchantAddress address) {
        return new MerchantAddressView(
                address.getId(),
                address.getShopId(),
                address.getContactName(),
                address.getPhone(),
                address.getRegionCode(),
                address.getProvince(),
                address.getCity(),
                address.getDistrict(),
                address.getDetail(),
                address.getPostalCode(),
                address.getCompanyName(),
                address.getNote(),
                address.getDefaultShip(),
                address.getDefaultReturn(),
                address.getStatus(),
                address.getCreatedAt(),
                address.getUpdatedAt());
    }
}
