package com.shop.platform.infra.security.authz;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 接口所需权限码声明。方法级覆盖类级；value 为 ANY 语义——主体持有其中任一码即通过。
 *
 * <p>管理端命名空间（/admin/**，除 /admin/auth/** 自服务）由 PermissionInterceptor 运行时默认拒绝 +
 * 启动自检测试双保险强制：漏标的代价必须是开发期失败，不能是生产期裸奔
 * （docs/permission-details.md ENF-02/ENF-05）。
 */
@Documented
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequirePermission {

    /** 所需权限码（common.Permissions 常量），ANY 语义 */
    String[] value();
}
