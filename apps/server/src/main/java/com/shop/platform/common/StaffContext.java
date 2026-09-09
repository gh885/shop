package com.shop.platform.common;

import java.util.UUID;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/** 当前请求平台员工 ID，infra.security 的 StaffAuthFilter 设值，admin 模块各层取用（镜像 UserIdHolder）。 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class StaffContext {

    private static final ThreadLocal<UUID> HOLDER = new ThreadLocal<>();

    public static void set(UUID staffId) {
        HOLDER.set(staffId);
    }

    public static UUID get() {
        return HOLDER.get();
    }

    public static void clear() {
        HOLDER.remove();
    }
}
