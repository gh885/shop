package com.shop.platform.admin.service;

import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.PermissionResolver;
import java.util.List;
import java.util.Set;

/**
 * 平台员工岗位。岗位→权限码映射的唯一收口（docs/permission-implementation.md「权限码表」）；
 * 改映射 = 改这里一行发版，将来角色入库时把本枚举的数据搬表即可，判权接口不变。
 *
 * <p>未知 role 字符串一律按无权限处理（fail-close，见 {@link #parseOrNull}）。
 */
public enum StaffRole {

    /** 超管：通配所有权限码，含员工管理（STAFF_MANAGE 的消费端 P2 提供） */
    SUPER_ADMIN,

    /** 入驻审核 */
    REVIEWER,

    /** 运营：CMS 内容 + 平台类目 */
    OPS;

    /**
     * 该岗位的有效权限集。SUPER_ADMIN 返回通配符，由判权层展开为全通过
     * （me 出参给前端时改用 {@link #declaredPermissions} 展开成具体码列表）。
     */
    public Set<String> permissions() {
        return switch (this) {
            case SUPER_ADMIN -> Set.of(PermissionResolver.WILDCARD);
            case REVIEWER -> Set.of(Permissions.SHOP_REVIEW);
            case OPS -> Set.of(Permissions.CMS_MANAGE, Permissions.CATEGORY_MANAGE);
        };
    }

    /** 对外展示用的具体权限码列表（SUPER_ADMIN 展开通配符）；顺序即 common.Permissions 文档顺序 */
    public List<String> declaredPermissions() {
        return this == SUPER_ADMIN ? Permissions.all() : List.copyOf(permissions());
    }

    /** 库里的 role 字符串转枚举；null 或未知值返回 null（调用方按无权限处理） */
    public static StaffRole parseOrNull(String value) {
        if (value == null) {
            return null;
        }
        try {
            return valueOf(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
