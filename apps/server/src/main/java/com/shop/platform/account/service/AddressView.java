package com.shop.platform.account.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.account.mapper.Address;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 买家地址的最小读模型：过滤软删标记后，可直接作为 HTTP 出参。 */
@Schema(name = "AddressResponse")
public record AddressView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID userId,
        @Schema(requiredMode = REQUIRED) String receiverName,
        @Schema(requiredMode = REQUIRED) String phone,
        @Schema(requiredMode = REQUIRED) String regionCode,
        @Schema(requiredMode = REQUIRED) String province,
        @Schema(requiredMode = REQUIRED) String city,
        @Schema(requiredMode = REQUIRED) String district,
        @Schema(requiredMode = REQUIRED) String detail,
        @Schema(requiredMode = REQUIRED) String label,
        @Schema(requiredMode = REQUIRED) Boolean isDefault,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static AddressView from(Address address) {
        return new AddressView(
                address.getId(),
                address.getUserId(),
                address.getReceiverName(),
                address.getPhone(),
                address.getRegionCode(),
                address.getProvince(),
                address.getCity(),
                address.getDistrict(),
                address.getDetail(),
                address.getLabel(),
                address.getIsDefault(),
                address.getCreatedAt(),
                address.getUpdatedAt());
    }
}
