package com.shop.platform.infra.web;

import java.time.ZoneId;
import java.util.Set;

/** IANA 时区 ID 的合法性判断：收 {@code X-Timezone} 头时用，非法值落平台展示时区（见 {@link LocaleFilter}）。 */
final class ZoneIds {

    private static final Set<String> COMMON = Set.of("UTC", "GMT", "Asia/Shanghai", "Asia/Tokyo", "Europe/London");

    private ZoneIds() {}

    /**
     * 是否是 JVM 认识的时区 ID。
     *
     * <p>{@code ZoneId.getAvailableZoneIds()} 是全集（含 {@code Etc/*} 与历史名），逐个试代价高；
     * 这里先用常见集合挡掉绝大多数请求，再用 {@code ZoneId.of} 兜底——它是纯查表不抛的写法，
     * 但仍包一层 catch：不同 JDK 的 tzdb 覆盖略有差异，别让一条头把请求打成 500。
     */
    static boolean isValid(String candidate) {
        if (COMMON.contains(candidate)) {
            return true;
        }
        try {
            return ZoneId.of(candidate) != null;
        } catch (RuntimeException e) {
            return false;
        }
    }
}
