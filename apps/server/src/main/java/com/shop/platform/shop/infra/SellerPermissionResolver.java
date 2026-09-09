package com.shop.platform.shop.infra;

import com.shop.platform.infra.security.authz.PermissionResolver;
import com.shop.platform.shop.model.MemberRole;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 店铺成员域判权适配：读 ShopMembershipFilter 装载的 {@link ShopMemberContext}。
 * OWNER 通配全通过；MEMBER 按被授予的权限码集。当前请求不在卖家域（无店铺上下文）返回 null 让位。
 */
@Component
public class SellerPermissionResolver implements PermissionResolver {

    @Override
    public Set<String> permissions() {
        ShopMemberContext.Member member = ShopMemberContext.get();
        if (member == null) {
            return null;
        }
        return member.role() == MemberRole.OWNER
                ? Set.of(PermissionResolver.WILDCARD)
                : member.permissions() == null ? Set.of() : Set.copyOf(member.permissions());
    }
}
