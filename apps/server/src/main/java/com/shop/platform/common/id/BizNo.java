package com.shop.platform.common.id;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Objects;

/**
 * 对外业务号：前缀 + 业务日期 + 12 位随机段，例如 {@code SO20261020K7M2Q4Z8X1AB}。
 *
 * <p>本地生成，不查库、不连 Redis、不需要任何协调，所以它能横向扩到任意节点。代价是**允许空号**，因此只用于订单号、
 * 支付流水号这类"看起来要连续、其实不用连续"的号；凭证号、发票号那类必须连续的走 {@link BizSequence}。
 *
 * <p>随机段 12 位 Crockford base32（60 bit）。一天一千万单的碰撞概率约 4e-5，库里加唯一索引兜底，撞了重生成一次即可。
 */
public final class BizNo {

    /** Crockford base32：去掉 I、L、O、U，避免人工抄号时和 1、0 看混。 */
    private static final char[] ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();

    private static final DateTimeFormatter DATE = DateTimeFormatter.BASIC_ISO_DATE;

    private static final int RANDOM_LENGTH = 12;

    private static final SecureRandom RANDOM = new SecureRandom();

    private BizNo() {}

    public static String of(String prefix, LocalDate businessDate) {
        Objects.requireNonNull(prefix, "prefix");
        Objects.requireNonNull(businessDate, "businessDate");
        if (prefix.isEmpty()) {
            throw new IllegalArgumentException("业务号前缀不能为空");
        }

        StringBuilder number = new StringBuilder(prefix.length() + 8 + RANDOM_LENGTH);
        number.append(prefix).append(DATE.format(businessDate));
        for (int i = 0; i < RANDOM_LENGTH; i++) {
            number.append(ALPHABET[RANDOM.nextInt(ALPHABET.length)]);
        }
        return number.toString();
    }
}
