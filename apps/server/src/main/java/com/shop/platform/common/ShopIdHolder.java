package com.shop.platform.common;

import java.util.UUID;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 当前请求的店铺上下文（X-Shop-Id 头解析 + 成员校验后的 shopId），shop 模块的 ShopMembershipFilter 设值，
 * 卖家侧接口（/seller/**）统一取用，不再由前端在请求体里传 shopId。
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class ShopIdHolder {

    private static final ThreadLocal<UUID> HOLDER = new ThreadLocal<>();

    public static void set(UUID shopId) {
        HOLDER.set(shopId);
    }

    public static UUID get() {
        return HOLDER.get();
    }

    public static void clear() {
        HOLDER.remove();
    }
}
