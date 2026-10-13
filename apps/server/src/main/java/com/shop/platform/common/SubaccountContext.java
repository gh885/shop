package com.shop.platform.common;

import java.util.UUID;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 当前请求的子账号 ID，infra.security 的 SellerAuthFilter 设值，卖家域的过滤器与判权解析取用
 * （镜像 {@link UserIdHolder} / {@link StaffContext}）。
 *
 * <p>与 {@link UserIdHolder} 互斥：一条请求要么是用户身份（买家/店主），要么是子账号身份，
 * 两套 id 空间不通用（子账号 id 不是 account.users.id），所以判权与归属校验必须先问「这一侧有没有值」。
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class SubaccountContext {

    private static final ThreadLocal<UUID> HOLDER = new ThreadLocal<>();

    public static void set(UUID subaccountId) {
        HOLDER.set(subaccountId);
    }

    public static UUID get() {
        return HOLDER.get();
    }

    public static void clear() {
        HOLDER.remove();
    }
}
