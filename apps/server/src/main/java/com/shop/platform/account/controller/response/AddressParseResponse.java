package com.shop.platform.account.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.account.service.AddressParseResult;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 智能粘贴解析出参：镜像 service 的 AddressParseResult，字段只减不增。
 * regionCode 为映射到的国标 6 位区划码（名称未命中时为 null，前端需让用户补齐区划）。
 */
public record AddressParseResponse(
        @Schema(requiredMode = REQUIRED) String receiverName,
        @Schema(requiredMode = REQUIRED) String phone,
        @Schema(requiredMode = REQUIRED) String regionCode,
        @Schema(requiredMode = REQUIRED) String province,
        @Schema(requiredMode = REQUIRED) String city,
        @Schema(requiredMode = REQUIRED) String district,
        @Schema(requiredMode = REQUIRED) String detail) {

    public static AddressParseResponse from(AddressParseResult result) {
        return new AddressParseResponse(
                result.receiverName(),
                result.phone(),
                result.regionCode(),
                result.province(),
                result.city(),
                result.district(),
                result.detail());
    }
}
