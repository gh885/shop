package com.shop.platform.kernel;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * 可替换的时间源，方便测试 mock。
 */
public class OffsetDateTimeProvider {

    private static final ZoneOffset UTC = ZoneOffset.UTC;

    private OffsetDateTimeProvider() {}

    public static OffsetDateTime now() {
        return OffsetDateTime.now(UTC);
    }
}
