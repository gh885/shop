package com.shop.platform.infra.security.authz;

import java.util.Set;

/**
 * 判权 SPI：各主体域提供一个实现（admin :: StaffPermissionResolver / seller :: SellerPermissionResolver），
 * 拦截器按注册顺序取第一个非 null 结果作为当前请求主体的有效权限集。
 *
 * <p>实现方约定：当前请求不属于本域（如上下文里没有本域主体 ID）返回 null 让位；
 * 属于本域但无权则返回空集（fail-close）。实时查库不做缓存——收权必须下一个请求生效
 * （docs/conventions/permission-codes.md）。
 */
public interface PermissionResolver {

    /** 通配符：SUPER_ADMIN 的全通过标记，只在解析层流转，注解上永远写具体码 */
    String WILDCARD = "*";

    /** 当前请求主体的有效权限集；主体不在本域时返回 null */
    Set<String> permissions();
}
