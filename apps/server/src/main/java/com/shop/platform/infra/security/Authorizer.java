package com.shop.platform.infra.security;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * 权限判断的唯一入口。三端共用。
 *
 * <p>用法是显式调用，不是靠注解：
 *
 * <pre>{@code
 * AccessScope.Seller scope = authorizer.seller(Permission.ORDER_READ);
 * orders.page(scope, ...);   // scope 带着归属与店铺范围往下传，SQL 只认它
 * }</pre>
 *
 * <p><b>身份来源是 Spring Security 的 {@code SecurityContext}，不是自己的 ThreadLocal。</b>
 * 两套上下文一定会漂移：某个入口用一套、某个过滤器用另一套，就会出现「日志里是 A 操作、判权用的是 B」。
 *
 * <p>为什么权限用显式调用、而审计用清单记录：两者防的东西不同。审计要记录「数据变成了什么」，注解拿不到前后值；
 * 权限只需要知道「这个动作能不能做」，显式调用便宜且看得见，注解会被代理和自调用悄悄绕过。
 *
 * <p>只做功能权限和数据范围。字段脱敏（客服只看手机号后四位）不在这里，那是序列化层的责任；
 * 金额阈值也不在这里——这里只提供取值，比较是业务规则。
 */
@Component
public class Authorizer {

    /**
     * 授权表里出现过的码。**清单外的码一律起不来**——"代码检查了一个库里没有的码"和
     * "库里挂了一个没人检查的码"都是静默失败，唯一能挡住它们的时机是启动。
     */
    private static final String SELLER_GRANTED_CODES =
            """
            SELECT DISTINCT rp.permission_code
              FROM authz.role_permission rp
              JOIN authz.role r ON r.id = rp.role_id
             WHERE r.owner_kind = 'merchant'
            """;

    public Authorizer(JdbcClient jdbc) {
        List<String> sellerCodes =
                jdbc.sql(SELLER_GRANTED_CODES).query(String.class).list();

        Set<String> known = Permission.codes();
        Set<String> unknown = new TreeSet<>();
        sellerCodes.stream().filter(code -> !known.contains(code)).forEach(unknown::add);
        if (!unknown.isEmpty()) {
            throw new IllegalStateException(
                    "授权表里出现了 contracts/permissions.yaml 没有的权限码: " + unknown + "。库里没有任何码能绕过清单——确认是拼错还是漏登记。");
        }

        // 平台侧的"高危只授超管"**不作为 blanket 规则**：high 说的是"这个动作危险"，
        // 不等于"只有超管能做"——封店是审核岗的本职，补录轨迹是运营岗的本职。
        // 岗位到高危码的授予由种子迁移显式写，review 逐条看；三个阶段、一张迁移，review 就是那道闸。
        // 用一条 blanket 规则代替 review 的后果是：为了让规则变绿，把真正的危险动作标成 normal。

        // 自助制下商家能自己拼角色，这道门是唯一挡住"把动钱码拼进客服角色"的地方。
        // 它校验的是存量：平台把某个码改成不可转授之后，历史角色若违反就起不来。
        Set<String> grantable = Permission.assignableCodes();
        List<String> nonAssignable =
                sellerCodes.stream().filter(code -> !grantable.contains(code)).toList();
        if (!nonAssignable.isEmpty()) {
            throw new IllegalStateException("商家角色持有了不可转授的权限码: " + nonAssignable + "。动钱、管钥匙、不可逆的码只能由主账号直接持有，不进任何商家角色。");
        }
    }

    /** 当前操作人。没有身份就抛，没有匿名兜底。 */
    public CurrentOperator current() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof CurrentOperator operator) {
            return operator;
        }
        throw new ForbiddenException("没有操作人上下文，请求未认证");
    }

    /** 匿名可达的公开端点用：没有身份回 null，由调用方决定降级口径（如按 IP 限流）。 */
    public CurrentOperator currentOrNull() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getPrincipal() instanceof CurrentOperator operator
                ? operator
                : null;
    }

    /**
     * 买家凭据。买家没有权限点（边界在 {@code buyer_id} 列绑定上），所以这里不做 {@code check}，
     * 只确认"你确实是买家"。
     */
    public AccessScope.Buyer buyer() {
        CurrentOperator operator = current();
        if (!CurrentOperator.TYPE_BUYER.equals(operator.operatorType())) {
            throw new ForbiddenException("只有买家可以执行这个操作");
        }
        return new AccessScope.Buyer(operator.operatorId());
    }

    /**
     * 已认证的商家凭据，<b>不要求权限点</b>。
     *
     * <p>只给"这个端点没有可判的动作"用：读自己的账号信息、登出、改自己的语言偏好、重提入驻申请。
     * 这类端点仍然需要身份（不能匿名），但没有任何"能不能做"的问题——它就是对你自己的账号做事。
     *
     * <p><b>凡是碰到别人数据的端点都不许用它。</b>判据很简单：这个操作的对象是"我自己的账号"
     * 还是"一笔业务数据"。前者用它，后者必须带权限点。
     */
    public AccessScope.Seller seller() {
        CurrentOperator operator = current();
        if (!CurrentOperator.TYPE_SELLER.equals(operator.operatorType()) || operator.merchantId() == null) {
            throw new ForbiddenException("只有卖家可以执行这个操作");
        }
        return new AccessScope.Seller(
                operator.operatorId(), operator.merchantId(), operator.shopIds(), operator.refundCap());
    }

    /**
     * 已认证的平台员工凭据，不要求权限点。语义与 {@link #seller()} 对称，同样只给"对自己账号做事"的端点。
     */
    public AccessScope.Platform platform() {
        CurrentOperator operator = current();
        if (!CurrentOperator.TYPE_STAFF.equals(operator.operatorType())) {
            throw new ForbiddenException("只有平台员工可以执行这个操作");
        }
        return new AccessScope.Platform(operator.operatorId());
    }

    /**
     * 商家凭据：判权 + 归属 + 店铺范围一次取到。
     *
     * <p>顺序是**先认池、再判权**：拿买家的令牌去查卖家的权限点，本来就该在类型这一关就断掉，
     * 而不是靠"集合里恰好没有这个码"。
     *
     * @throws ForbiddenException 不是卖家身份，或缺这个权限
     */
    public AccessScope.Seller seller(Permission permission) {
        Objects.requireNonNull(permission, "permission");
        CurrentOperator operator = current();
        if (!CurrentOperator.TYPE_SELLER.equals(operator.operatorType()) || operator.merchantId() == null) {
            throw new ForbiddenException("只有卖家可以执行这个操作");
        }
        if (!operator.has(permission)) {
            throw new ForbiddenException("缺少权限: " + permission.code());
        }
        return new AccessScope.Seller(
                operator.operatorId(), operator.merchantId(), operator.shopIds(), operator.refundCap());
    }

    /**
     * 平台员工凭据。没有店铺范围——这个维度对平台身份不适用，所以调用方不能用它去拼
     * {@code shop_id IN (...)}。
     */
    public AccessScope.Platform platform(Permission permission) {
        Objects.requireNonNull(permission, "permission");
        CurrentOperator operator = current();
        if (!CurrentOperator.TYPE_STAFF.equals(operator.operatorType())) {
            throw new ForbiddenException("只有平台员工可以执行这个操作");
        }
        if (!operator.has(permission)) {
            throw new ForbiddenException("缺少权限: " + permission.code());
        }
        return new AccessScope.Platform(operator.operatorId());
    }

    public void check(Permission permission) {
        Objects.requireNonNull(permission, "permission");
        if (!current().has(permission)) {
            throw new ForbiddenException("缺少权限: " + permission.code());
        }
    }

    /** 数据范围校验。每个按 shopId 查改的地方都要调一次，这是越权的主要入口。 */
    public void checkShop(UUID shopId) {
        Objects.requireNonNull(shopId, "shopId");
        if (!current().canOperateShop(shopId)) {
            throw new ForbiddenException("无权操作店铺: " + shopId);
        }
    }

    public boolean has(Permission permission) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null
                && authentication.getPrincipal() instanceof CurrentOperator operator
                && operator.has(permission);
    }

    /** 当前身份可用的全部权限点，给前端画菜单用。 */
    public Set<String> permissionsOfCurrentOperator() {
        return current().permissions();
    }

    /**
     * 给定时任务、消息消费、测试用：临时套一个身份，退出时一定还原。
     *
     * <p>不要指望线程上下文自动继承——{@code @Async} 和线程池里什么都没有。
     */
    public static void runAs(CurrentOperator operator, Runnable action) {
        SecurityContext previous = SecurityContextHolder.getContext();
        try {
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(new UsernamePasswordAuthenticationToken(operator, null, List.of()));
            SecurityContextHolder.setContext(context);
            action.run();
        } finally {
            SecurityContextHolder.setContext(previous);
        }
    }
}
