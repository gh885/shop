package com.shop.platform.infra.security;

import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * 当前请求的操作人：谁、以什么身份、属于哪个商家、能碰哪些店、有哪些权限。
 *
 * <p>权限和数据范围在认证那一刻一次性算好，塞进这里，后续判断都是内存查表——不要在每个 service 里回查数据库。
 *
 * @param shopIds 数据范围。为空表示这个人没有任何店铺可操作，不是"全部"
 */
public record CurrentOperator(
        UUID operatorId, String operatorType, UUID merchantId, Set<UUID> shopIds, Set<String> permissions) {

    public static final String TYPE_BUYER = "buyer";
    public static final String TYPE_SELLER = "seller";
    public static final String TYPE_STAFF = "staff";

    public CurrentOperator {
        Objects.requireNonNull(operatorId, "operatorId");
        Objects.requireNonNull(operatorType, "operatorType");
        shopIds = Set.copyOf(Objects.requireNonNull(shopIds, "shopIds"));
        permissions = Set.copyOf(Objects.requireNonNull(permissions, "permissions"));
    }

    public boolean has(Permission permission) {
        return permissions.contains(permission.code());
    }

    public boolean canOperateShop(UUID shopId) {
        return shopIds.contains(shopId);
    }
}
