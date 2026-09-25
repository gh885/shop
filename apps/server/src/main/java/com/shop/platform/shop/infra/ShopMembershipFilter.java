package com.shop.platform.shop.infra;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.infra.web.FilterExceptionHandler;
import com.shop.platform.infra.web.RequestPaths;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 店铺上下文过滤链：只处理卖家侧接口（/seller/**）。从 X-Shop-Id 头取店铺，校验当前用户是该店 ACTIVE 成员，
 * 通过后置 ShopIdHolder 并顺带把成员角色/权限装进 ShopMemberContext——卖家域判权零额外查询；
 * 产物接口的 shopId 一律从这里取，不再信任请求体/参数里的 shopId（堵越权）。
 *
 * <p>顺序在 JwtAuthFilter（+10）之后，UserIdHolder 必然已设值。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
@RequiredArgsConstructor
public class ShopMembershipFilter extends OncePerRequestFilter {

    private final ShopMemberMapper shopMemberMapper;
    private final ShopMapper shopMapper;
    private final FilterExceptionHandler exceptionHandler;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // 非规范路径（含编码等）不跳过，进 doFilterInternal 统一 400
        String path = RequestPaths.routePath(request);
        return path != null && !RequestPaths.inNamespace(path, RequestPaths.SELLER_NAMESPACE);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            if (RequestPaths.routePath(request) == null) {
                throw BusinessException.badRequest("非法请求路径");
            }
            // 1. 解析 X-Shop-Id 头
            String header = request.getHeader("X-Shop-Id");
            UUID shopId = null;
            if (header != null && !header.isBlank()) {
                try {
                    shopId = UUID.fromString(header.trim());
                } catch (IllegalArgumentException ignored) {
                    // shopId 保持 null，统一走下面的 403
                }
            }
            if (shopId == null) {
                throw BusinessException.forbidden("缺少店铺上下文（X-Shop-Id）");
            }

            // 2. 店铺须存在且可用（哪几档算可用见 ShopMapper.existsUsable）：shop.shops 里没有的店，或已被拒/封禁，
            //    不允许商家做任何操作（防"商品挂在不存在的店铺"这类孤儿数据）。挡的是「你有没有资格在这里操作」，故 403
            if (!shopMapper.existsUsable(shopId)) {
                throw BusinessException.forbidden("店铺不存在或不可用");
            }

            // 3. 成员校验 + 权限装载：ACTIVE 成员行整行取出，角色/权限塞上下文供 SellerPermissionResolver 判权
            ShopMember member = shopMemberMapper.findActiveMember(shopId, UserIdHolder.get());
            if (member == null) {
                throw BusinessException.forbidden("你不是该店铺成员");
            }

            // 4. 落上下文，请求结束清理
            ShopIdHolder.set(shopId);
            ShopMemberContext.set(new ShopMemberContext.Member(member.getRole(), member.getPermissions()));
            chain.doFilter(request, response);
        } catch (BusinessException ex) {
            exceptionHandler.resolve(request, response, ex);
        } finally {
            ShopIdHolder.clear();
            ShopMemberContext.clear();
        }
    }
}
