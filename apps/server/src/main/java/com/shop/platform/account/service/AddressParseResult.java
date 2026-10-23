package com.shop.platform.account.service;

/**
 * 智能粘贴解析结果：把非结构化收货文本拆成结构化字段。
 * regionCode 为映射到的国标 6 位区划码（名称未命中时为 null，前端需让用户补齐区划）。
 *
 * <p>本 record 即 HTTP 出参（无独立 Response 镜像）：字段只减不增，改动等于改接口。
 */
public record AddressParseResult(
        String receiverName,
        String phone,
        String regionCode,
        String province,
        String city,
        String district,
        String detail) {}
