package com.shop.platform.shop.infra;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.infra.web.RequestPaths;
import com.shop.platform.infra.web.UnauthorizedWriter;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import com.shop.platform.shop.model.ShopStatus;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

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
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // 非规范路径（含编码等）不跳过，进 doFilterInternal 统一 400
        String path = RequestPaths.routePath(request);
        return path != null && !RequestPaths.inNamespace(path, "/seller");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (RequestPaths.routePath(request) == null) {
            UnauthorizedWriter.write(response, objectMapper, 400, null, "非法请求路径");
            return;
        }
        try {
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
                UnauthorizedWriter.write(response, objectMapper, 403, null, "缺少店铺上下文（X-Shop-Id）");
                return;
            }

            // 2. 店铺须存在且可用（PENDING_REVIEW/ACTIVE）：shop.shops 里没有的店，或已被拒/封禁，不允许商家做任何操作
            //    （防"商品挂在不存在的店铺"这类孤儿数据）
            Long shopCount = shopMapper.selectCount(new LambdaQueryWrapper<Shop>()
                    .eq(Shop::getId, shopId)
                    .in(Shop::getStatus, List.of(ShopStatus.PENDING_REVIEW, ShopStatus.ACTIVE)));
            if (shopCount == 0) {
                UnauthorizedWriter.write(response, objectMapper, 403, null, "店铺不存在或不可用");
                return;
            }

            // 3. 成员校验 + 权限装载：ACTIVE 成员行整行取出，角色/权限塞上下文供 SellerPermissionResolver 判权
            ShopMember member = shopMemberMapper.findActiveMember(shopId, UserIdHolder.get());
            if (member == null) {
                UnauthorizedWriter.write(response, objectMapper, 403, null, "你不是该店铺成员");
                return;
            }

            // 4. 落上下文，请求结束清理
            ShopIdHolder.set(shopId);
            ShopMemberContext.set(new ShopMemberContext.Member(member.getRole(), member.getPermissions()));
            chain.doFilter(request, response);
        } finally {
            ShopIdHolder.clear();
            ShopMemberContext.clear();
        }
    }
}
