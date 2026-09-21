package com.shop.platform.account.api;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 地址只读视图：account.addresses 的跨模块投影。
 * 含归属（userId）与软删标记（deletedAt）——归属校验与软删过滤是消费方职责（order 据此判 404）。
 *
 * <p>{@code regionCode} 是国标 6 位区划码：省/市/县名字只够展示（同音、简称、重名都比不出唯一地区），
 * 运费模板按地区计价必须拿它当键。
 */
public record AddressSnapshotView(
        UUID userId,
        OffsetDateTime deletedAt,
        String receiverName,
        String phone,
        String regionCode,
        String province,
        String city,
        String district,
        String detail) {}
