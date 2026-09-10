package com.shop.platform.account.service;

/**
 * 智能粘贴解析结果：把非结构化收货文本拆成结构化字段。
 * regionCode 为映射到的国标 6 位区划码（名称未命中时为 null，前端需让用户补齐区划）。
 */
public record AddressParseResult(
        String receiverName,
        String phone,
        String regionCode,
        String province,
        String city,
        String district,
        String detail) {}
