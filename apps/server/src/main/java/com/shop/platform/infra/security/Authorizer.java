package com.shop.platform.infra.security;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
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
 * authorizer.check(Permission.ORDER_REFUND);
 * authorizer.checkShop(order.shopId());
 * }</pre>
 *
 * <p><b>身份来源是 Spring Security 的 {@code SecurityContext}，不是自己的 ThreadLocal。</b>
 * 两套上下文一定会漂移：某个入口用一套、某个过滤器用另一套，就会出现「日志里是 A 操作、判权用的是 B」。
 *
 * <p>为什么权限用显式调用、而审计用清单记录：两者防的东西不同。审计要记录「数据变成了什么」，注解拿不到前后值；
 * 权限只需要知道「这个动作能不能做」，显式调用便宜且看得见，注解会被代理和自调用悄悄绕过。
 *
 * <p>只做功能权限和数据范围。字段脱敏（客服只看手机号后四位）不在这里，那是序列化层的责任。
 */
@Component
public class Authorizer {

    private static final String ALL_PERMISSIONS = "SELECT code FROM common.permission";

    /**
     * 跨域授予检查：卖家侧只能持有 seller 域的点，平台侧只能持有 admin 域的点。
     *
     * <p>这条校验存在的原因是真实踩过的坑：{@code SellerOperatorResolver} 给主账号授的是
     * **整张 common.permission 表**，于是一个卖家店主拿到了 {@code SUSPENSE_MANAGE}（手动退真钱）、
     * {@code LEDGER_VIEW}（全平台余额）、{@code STAFF_MANAGE}（管平台员工）。
     * 修那条 SQL 只能治标；有了域这个维度，错授在启动时就被挡住。
     */
    private static final String CROSS_DOMAIN_GRANTS =
            """
            SELECT 'seller.role_permission' AS holder, rp.permission_code, p.domain
              FROM seller.role_permission rp
              JOIN common.permission p ON p.code = rp.permission_code
             WHERE p.domain = 'admin'
            UNION ALL
            SELECT 'staff.role_permission' AS holder, rp.permission_code, p.domain
              FROM staff.role_permission rp
              JOIN common.permission p ON p.code = rp.permission_code
             WHERE p.domain = 'seller'
             ORDER BY 1, 2
            """;

    /**
     * 高危权限点的误授权检查：{@code risk_level = 'high'} 的点（动钱、动治理）只许 SUPER_ADMIN 持有。
     * 与枚举比对同一纪律——错配置在启动时炸，不在出事时发现。
     */
    private static final String HIGH_RISK_MISGRANTED =
            """
            SELECT rp.role || ':' || rp.permission_code
              FROM staff.role_permission rp
              JOIN common.permission p ON p.code = rp.permission_code
             WHERE p.risk_level = 'high' AND rp.role <> 'SUPER_ADMIN'
             ORDER BY 1
            """;

    private final Set<String> catalogue;

    public Authorizer(JdbcClient jdbc) {
        this.catalogue =
                Set.copyOf(jdbc.sql(ALL_PERMISSIONS).query(String.class).list());

        Set<String> declared =
                Arrays.stream(Permission.values()).map(Permission::code).collect(Collectors.toUnmodifiableSet());
        if (!declared.equals(catalogue)) {
            Set<String> onlyInDb = diff(catalogue, declared);
            Set<String> onlyInCode = diff(declared, catalogue);
            throw new IllegalStateException("权限点清单和 Permission 枚举对不上。只在库里: " + onlyInDb + "；只在代码里: " + onlyInCode);
        }

        List<String> crossDomain = jdbc.sql(CROSS_DOMAIN_GRANTS)
                .query((rs, row) -> rs.getString("holder") + ":" + rs.getString("permission_code"))
                .list();
        if (!crossDomain.isEmpty()) {
            throw new IllegalStateException("存在跨域授予：卖家侧持有了平台权限，或平台侧持有了卖家权限。逐条: " + crossDomain
                    + "。域边界见 Permission.Domain 与 contracts/permissions.yaml。");
        }

        List<String> misgranted =
                jdbc.sql(HIGH_RISK_MISGRANTED).query(String.class).list();
        if (!misgranted.isEmpty()) {
            throw new IllegalStateException("高危权限点（risk_level=high）被授给了非 SUPER_ADMIN 岗位: " + misgranted
                    + "。高危点的授权变更必须连带 risk_level 复核，见 common.permission 的治理元数据。");
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

    private static Set<String> diff(Set<String> left, Set<String> right) {
        return left.stream().filter(item -> !right.contains(item)).collect(Collectors.toUnmodifiableSet());
    }
}
