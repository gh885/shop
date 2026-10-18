package com.shop.platform.aftersale.service;

import com.github.f4b6a3.uuid.UuidCreator;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * 退款单号生成：前缀 + 年月日时分秒毫秒（17 位）+ 主键随机段（6 位），总长 ≤ 32。
 *
 * <p>只含字母数字是硬要求：退款单号同时是渠道退款的 {@code out_request_no} 幂等键，
 * 带分隔符会被支付宝侧拒掉。前缀区分来源（RF 常规退款 / RC 补偿），对账时肉眼可分。
 */
public final class RefundNumbers {

    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    private RefundNumbers() {}

    /** @param prefix 两位来源前缀：RF = 退款单，RC = 补偿单 */
    public static String next(String prefix) {
        UUID id = UuidCreator.getTimeOrderedEpoch();
        return prefix
                + OffsetDateTime.now(ZoneOffset.UTC).format(STAMP)
                + "%06d".formatted(Math.floorMod(id.getLeastSignificantBits(), 1_000_000));
    }
}
