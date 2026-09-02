package com.shop.platform.common;

import java.util.List;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 当前请求的店铺成员上下文（角色 + 被授予的权限码）。ShopMembershipFilter 校验成员身份时顺带装载
 * ——判权零额外查询；卖家域的 SellerPermissionResolver 取用，请求结束随 ShopIdHolder 一并清理。
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class ShopMemberContext {

    /** 成员判权视图：role 为 OWNER/MEMBER 枚举名；permissions 仅 MEMBER 消费（OWNER 走通配） */
    public record Member(String role, List<String> permissions) {}

    private static final ThreadLocal<Member> HOLDER = new ThreadLocal<>();

    public static void set(Member member) {
        HOLDER.set(member);
    }

    public static Member get() {
        return HOLDER.get();
    }

    public static void clear() {
        HOLDER.remove();
    }
}
