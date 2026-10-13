package com.shop.platform.shop.infra;

import com.shop.platform.account.api.SubaccountReadQuery;
import com.shop.platform.account.api.SubaccountSession;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ShopIdHolder;
import com.shop.platform.common.SubaccountContext;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.infra.web.FilterExceptionHandler;
import com.shop.platform.infra.web.RequestPaths;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import com.shop.platform.shop.model.MemberRole;
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
 * 店铺上下文过滤链：只处理卖家侧接口（{@code /seller/**}）。身份有两种来源，装载出来的东西是同一种：
 * 店铺上下文（{@link ShopIdHolder}）+ 判权视图（{@link ShopMemberContext}）。
 *
 * <ul>
 *   <li><b>店主</b>（用户令牌）：店从 {@code X-Shop-Id} 取，校验调用者是该店 ACTIVE 的 OWNER ——
 *       通配全通过。
 *   <li><b>子账号</b>（{@code kind=subaccount}）：店<b>自带</b>在凭证上（不需要也不吃 {@code X-Shop-Id}），
 *       按被授予的权限码判权。带上别的店的 {@code X-Shop-Id} 一律 403——客户端把上一家店的记忆带过来
 *       是它的 bug，静默忽略只会让 bug 藏得更深。
 * </ul>
 *
 * <p>产物接口的 shopId 一律从这里取，不再信任请求体/参数里的 shopId（堵越权）。
 *
 * <p>顺序在 JwtAuthFilter（+10）与 SubaccountAuthFilter（+8）之后，两种身份 Holder 必有一个已设值。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
@RequiredArgsConstructor
public class ShopMembershipFilter extends OncePerRequestFilter {

    private final ShopMemberMapper shopMemberMapper;
    private final ShopMapper shopMapper;
    private final SubaccountReadQuery subaccountReadQuery;
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
            try {
                if (RequestPaths.routePath(request) == null) {
                    throw BusinessException.badRequest("非法请求路径");
                }
                UUID subaccountId = SubaccountContext.get();
                if (subaccountId != null) {
                    loadSubaccount(request, subaccountId);
                } else {
                    loadOwner(request);
                }
            } catch (RuntimeException ex) {
                exceptionHandler.resolve(request, response, ex);
                return;
            }
            // 只接管本过滤器的检查失败；下游可能已提交响应，不能再写一份错误体。
            chain.doFilter(request, response);
        } finally {
            ShopIdHolder.clear();
            ShopMemberContext.clear();
        }
    }

    // 子账号：店自带在凭证上，权限码从凭证行读（每请求查库 —— 改权/停用下一请求即生效）
    private void loadSubaccount(HttpServletRequest request, UUID subaccountId) {
        // 1. 会话装载：非 ACTIVE（待激活 / 已停用 / 已移除）取不到，一律 403。这里是「停用即时生效」的落点
        SubaccountSession session = subaccountReadQuery
                .findActiveSession(subaccountId)
                .orElseThrow(() -> BusinessException.forbidden("子账号不存在或已停用"));

        // 2. 店铺须存在且可用（哪几档算可用见 ShopMapper.existsUsable）：与店主同一条闸门
        if (!shopMapper.existsUsable(session.shopId())) {
            throw BusinessException.forbidden("店铺不存在或不可用");
        }

        // 3. 客户端带来的 X-Shop-Id 必须就是自己的店（带了别家 = 客户端把上一家店的记忆带过来了）
        UUID header = parseShopHeader(request);
        if (header != null && !header.equals(session.shopId())) {
            throw BusinessException.forbidden("子账号只能操作所属店铺");
        }

        // 4. 落上下文：子账号在店铺里的角色等价于 MEMBER（判权按被授予码集，无通配）
        ShopIdHolder.set(session.shopId());
        ShopMemberContext.set(new ShopMemberContext.Member(MemberRole.MEMBER, session.permissions()));
    }

    // 店主：店从 X-Shop-Id 取，ACTIVE 成员行整行取出（角色/权限塞上下文供判权零额外查询）
    private void loadOwner(HttpServletRequest request) {
        // 1. 解析 X-Shop-Id 头
        UUID shopId = parseShopHeader(request);
        if (shopId == null) {
            throw BusinessException.forbidden("缺少店铺上下文（X-Shop-Id）");
        }

        // 2. 店铺须存在且可用（挡的是「你有没有资格在这里操作」，故 403）
        if (!shopMapper.existsUsable(shopId)) {
            throw BusinessException.forbidden("店铺不存在或不可用");
        }

        // 3. 成员校验 + 权限装载
        ShopMember member = shopMemberMapper.findActiveMember(shopId, UserIdHolder.get());
        if (member == null) {
            throw BusinessException.forbidden("你不是该店铺成员");
        }

        // 4. 落上下文，请求结束清理
        ShopIdHolder.set(shopId);
        ShopMemberContext.set(new ShopMemberContext.Member(member.getRole(), member.getPermissions()));
    }

    /** 解析 X-Shop-Id 头：缺失/空白/非 UUID 一律给 null，由调用方决定这算不算错 */
    private static UUID parseShopHeader(HttpServletRequest request) {
        String header = request.getHeader("X-Shop-Id");
        if (header == null || header.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(header.trim());
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }
}
