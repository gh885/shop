package com.shop.platform.logistics.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.logistics.mapper.Carrier;
import io.swagger.v3.oas.annotations.media.Schema;

/** 承运商出参（发货下拉）：只给下拉要的 code + 展示名，启停/排序是字典内部治理字段。 */
public record CarrierResponse(
        @Schema(requiredMode = REQUIRED) String code, @Schema(requiredMode = REQUIRED) String name) {

    public static CarrierResponse from(Carrier carrier) {
        return new CarrierResponse(carrier.getCode(), carrier.getName());
    }
}
