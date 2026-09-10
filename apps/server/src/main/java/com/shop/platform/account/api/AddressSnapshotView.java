package com.shop.platform.account.api;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 地址只读视图：account.addresses 的跨模块投影。
 * 含归属（userId）与软删标记（deletedAt）——归属校验与软删过滤是消费方职责（order 据此判 404）。
 */
public record AddressSnapshotView(
        UUID userId,
        OffsetDateTime deletedAt,
        String receiverName,
        String phone,
        String province,
        String city,
        String district,
        String detail) {}
