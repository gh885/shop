package com.shop.platform.staff.service;

import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.OperatorResolver;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.staff.mapper.StaffMapper;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 平台员工的身份解析。
 *
 * <p>与卖家身份的关键差别：<b>没有 shopIds</b>。平台运营看的是全平台数据，不是"被授权的几个店"。
 * 这个集合为空不代表没权限，而是"这个维度对平台身份不适用"——所以任何按 shopIds 判权的地方
 * 都必须先看 operatorType，不能靠集合是否为空去猜。
 */
@Component
public class StaffOperatorResolver implements OperatorResolver {

    private final StaffMapper store;

    public StaffOperatorResolver(StaffMapper store) {
        this.store = Objects.requireNonNull(store, "store");
    }

    @Override
    public String operatorType() {
        return CurrentOperator.TYPE_STAFF;
    }

    @Override
    public Optional<CurrentOperator> find(UUID operatorId) {
        return store.findById(operatorId)
                .filter(row -> "active".equals(row.status()))
                .map(row -> new CurrentOperator(
                        row.id(),
                        CurrentOperator.TYPE_STAFF,
                        null,
                        Set.of(),
                        permissionsOf(row.role()),
                        row.permissionVersion(),
                        // 退款上限是商家侧的属性阈值，平台身份没有这个维度
                        null));
    }

    /**
     * 岗位权限**从清单推导，不查库**（{@code contracts/permissions.yaml} 的 {@code staff_roles}）。
     *
     * <p>原来这里读 {@code staff.role_permission} 的种子行。那个形状的问题不是"多一张表"，
     * 是**同一份设计里两种口径**：SUPER_ADMIN 与商家主账号都是推导的，唯独 REVIEWER/OPS 靠种子。
     * 后果是种子漏同步 → 静默失权；表被清 → 全体失权（集成测试的 TRUNCATE 就是这么发现的）。
     */
    private Set<String> permissionsOf(String role) {
        return Permission.staffRoleCodes(role);
    }
}
