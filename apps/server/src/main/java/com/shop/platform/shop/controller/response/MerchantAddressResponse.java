package com.shop.platform.shop.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.shop.mapper.MerchantAddress;
import com.shop.platform.shop.model.AddressStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 商家地址出参：单表字段镜像（前端 zod 逐字段严格校验，只减不增）。
 * 刻意不吐 deletedAt（软删内部标记）；defaultShip/defaultReturn 即用途标记，无需角色嵌套。
 */
public record MerchantAddressResponse(
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

    public static MerchantAddressResponse from(MerchantAddress a) {
        return new MerchantAddressResponse(
                a.getId(),
                a.getShopId(),
                a.getContactName(),
                a.getPhone(),
                a.getRegionCode(),
                a.getProvince(),
                a.getCity(),
                a.getDistrict(),
                a.getDetail(),
                a.getPostalCode(),
                a.getCompanyName(),
                a.getNote(),
                a.getDefaultShip(),
                a.getDefaultReturn(),
                a.getStatus(),
                a.getCreatedAt(),
                a.getUpdatedAt());
    }

    public static List<MerchantAddressResponse> from(List<MerchantAddress> list) {
        return list.stream().map(MerchantAddressResponse::from).toList();
    }
}
