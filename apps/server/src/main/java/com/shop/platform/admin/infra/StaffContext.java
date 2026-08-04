package com.shop.platform.admin.infra;

import java.util.UUID;
import lombok.NoArgsConstructor;

/** 当前请求平台员工 ID，Admin 模块的 StaffAuthFilter 设值，本模块各层取用（镜像 common.UserIdHolder）。 */
@NoArgsConstructor
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
