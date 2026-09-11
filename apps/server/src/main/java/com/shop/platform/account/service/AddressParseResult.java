package com.shop.platform.account.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 智能粘贴解析结果：把非结构化收货文本拆成结构化字段。
 * regionCode 为映射到的国标 6 位区划码（名称未命中时为 null，前端需让用户补齐区划）。
 *
 * <p>本 record 即 HTTP 出参（无独立 Response 镜像）：字段只减不增，改动等于改接口。
 */
public record AddressParseResult(
        @Schema(requiredMode = REQUIRED) String receiverName,
        @Schema(requiredMode = REQUIRED) String phone,
        @Schema(requiredMode = REQUIRED) String regionCode,
        @Schema(requiredMode = REQUIRED) String province,
        @Schema(requiredMode = REQUIRED) String city,
        @Schema(requiredMode = REQUIRED) String district,
        @Schema(requiredMode = REQUIRED) String detail) {}
