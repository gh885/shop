package com.shop.platform.common.security;

import java.util.Arrays;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
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
 * <p>为什么权限用显式调用、而审计用清单+记录：两者防的东西不同。审计要记录"数据变成了什么"，注解拿不到前后值；
 * 权限只需要知道"这个动作能不能做"，显式调用反而便宜且看得见——一眼能扫出某个方法到底要什么权限，注解会被
 * 代理和自调用悄悄绕过。
 *
 * <p>只做功能权限和数据范围。字段脱敏（客服只看手机号后四位）不在这里，那是序列化层的责任。
 */
@Component
public class Authorizer {

    private static final String ALL_PERMISSIONS = "SELECT code FROM common.permission";

    private final OperatorResolver resolver;

    private final Set<String> catalogue;

    public Authorizer(OperatorResolver resolver, JdbcTemplate jdbc) {
        this.resolver = Objects.requireNonNull(resolver, "resolver");
        this.catalogue = Set.copyOf(jdbc.queryForList(ALL_PERMISSIONS, String.class));

        Set<String> declared =
                Arrays.stream(Permission.values()).map(Permission::code).collect(Collectors.toUnmodifiableSet());
        if (!declared.equals(catalogue)) {
            Set<String> onlyInDb = diff(catalogue, declared);
            Set<String> onlyInCode = diff(declared, catalogue);
            throw new IllegalStateException("权限点清单和 Permission 枚举对不上。只在库里: " + onlyInDb + "；只在代码里: " + onlyInCode);
        }
    }

    /** 认证过滤器调用：解析身份、写入上下文。找不到就是未认证。 */
    public CurrentOperator signIn(UUID operatorId) {
        CurrentOperator operator = resolver.find(Objects.requireNonNull(operatorId, "operatorId"))
                .orElseThrow(() -> new ForbiddenException("账号不存在或已停用: " + operatorId));
        OperatorContext.set(operator);
        return operator;
    }

    public void signOut() {
        OperatorContext.clear();
    }

    public void check(Permission permission) {
        Objects.requireNonNull(permission, "permission");
        if (!OperatorContext.require().has(permission)) {
            throw new ForbiddenException("缺少权限: " + permission.code());
        }
    }

    /** 数据范围校验。每个按 shopId 查改的地方都要调一次，这是越权的主要入口。 */
    public void checkShop(UUID shopId) {
        Objects.requireNonNull(shopId, "shopId");
        if (!OperatorContext.require().canOperateShop(shopId)) {
            throw new ForbiddenException("无权操作店铺: " + shopId);
        }
    }

    public boolean has(Permission permission) {
        return OperatorContext.current()
                .map(operator -> operator.has(permission))
                .orElse(false);
    }

    /** 当前身份可用的全部权限点，给前端画菜单用。 */
    public Set<String> permissionsOfCurrentOperator() {
        return OperatorContext.require().permissions();
    }

    private static Set<String> diff(Set<String> left, Set<String> right) {
        return left.stream().filter(item -> !right.contains(item)).collect(Collectors.toUnmodifiableSet());
    }
}
