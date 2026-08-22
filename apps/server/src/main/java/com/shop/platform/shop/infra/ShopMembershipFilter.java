package com.shop.platform.shop.infra;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.infra.web.RequestPaths;
import com.shop.platform.infra.web.UnauthorizedWriter;
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
import tools.jackson.databind.ObjectMapper;

/**
 * 店铺上下文过滤链：只处理卖家侧接口（/seller/**）。从 X-Shop-Id 头取店铺，校验当前用户是该店 ACTIVE 成员，
 * 通过后置 ShopIdHolder；产物接口的 shopId 一律从这里取，不再信任请求体/参数里的 shopId（堵越权）。
 *
 * <p>顺序在 JwtAuthFilter（+10）之后，UserIdHolder 必然已设值。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
@RequiredArgsConstructor
public class ShopMembershipFilter extends OncePerRequestFilter {

    private final ShopMemberMapper shopMemberMapper;
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // 非规范路径（含编码等）不跳过，进 doFilterInternal 统一 400
        String path = RequestPaths.routePath(request);
        return path != null && !path.startsWith("/seller/");
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

            // 2. 成员校验：当前用户必须是该店 ACTIVE 成员
            Long count = shopMemberMapper.selectCount(new LambdaQueryWrapper<ShopMember>()
                    .eq(ShopMember::getShopId, shopId)
                    .eq(ShopMember::getUserId, UserIdHolder.get())
                    .eq(ShopMember::getStatus, ShopMember.STATUS_ACTIVE));
            if (count == 0) {
                UnauthorizedWriter.write(response, objectMapper, 403, null, "你不是该店铺成员");
                return;
            }

            // 3. 落上下文，请求结束清理
            ShopIdHolder.set(shopId);
            chain.doFilter(request, response);
        } finally {
            ShopIdHolder.clear();
        }
    }
}
