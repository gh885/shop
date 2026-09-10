package com.shop.platform.account.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.account.mapper.Address;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 地址出参：字段镜像实体现状（前端 zod schema 逐字段严格校验，只减不增），
 * 刻意不吐 deletedAt（软删内部标记）。HTTP 契约与存储模型在此解耦。
 */
public record AddressResponse(
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

    public static AddressResponse from(Address a) {
        return new AddressResponse(
                a.getId(),
                a.getUserId(),
                a.getReceiverName(),
                a.getPhone(),
                a.getRegionCode(),
                a.getProvince(),
                a.getCity(),
                a.getDistrict(),
                a.getDetail(),
                a.getLabel(),
                a.getIsDefault(),
                a.getCreatedAt(),
                a.getUpdatedAt());
    }

    public static List<AddressResponse> from(List<Address> list) {
        return list.stream().map(AddressResponse::from).toList();
    }
}
