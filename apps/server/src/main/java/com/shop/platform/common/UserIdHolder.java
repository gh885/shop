package com.shop.platform.common;

import java.util.UUID;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/** 当前请求用户 ID，Auth 模块的 JwtAuthFilter 设值，各模块统一取用。 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class UserIdHolder {

    private static final ThreadLocal<UUID> HOLDER = new ThreadLocal<>();

    public static void set(UUID userId) {
        HOLDER.set(userId);
    }

    public static UUID get() {
        return HOLDER.get();
    }

    public static void clear() {
        HOLDER.remove();
    }
}
