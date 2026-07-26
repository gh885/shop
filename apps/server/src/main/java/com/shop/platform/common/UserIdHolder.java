package com.shop.platform.common;

/**
 * 当前请求用户 ID，Auth 模块的 JwtAuthFilter 设值，各模块统一取用。
 */
public final class UserIdHolder {

    private static final ThreadLocal<Long> HOLDER = new ThreadLocal<>();

    private UserIdHolder() {}

    public static void set(Long userId) {
        HOLDER.set(userId);
    }

    public static Long get() {
        return HOLDER.get();
    }

    public static void clear() {
        HOLDER.remove();
    }
}
