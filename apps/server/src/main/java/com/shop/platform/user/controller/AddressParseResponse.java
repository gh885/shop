package com.shop.platform.user.controller;

import com.shop.platform.user.service.AddressParseResult;

/**
 * 智能粘贴解析出参：镜像 service 的 AddressParseResult，字段只减不增。
 * regionCode 为映射到的国标 6 位区划码（名称未命中时为 null，前端需让用户补齐区划）。
 */
public record AddressParseResponse(
        String receiverName,
        String phone,
        String regionCode,
        String province,
        String city,
        String district,
        String detail) {

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
