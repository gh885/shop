package com.shop.platform.shop.service;

import com.shop.platform.common.Permissions;
import com.shop.platform.common.Validate;
import java.util.List;
import java.util.Set;

/**
 * 卖家侧可授予子账号的权限码白名单与入参规范化。
 *
 * <p>白名单只有两个码：MEMBER_MANAGE / SHOP_MANAGE 是 OWNER 固有、不入可授予集合
 * ——防权限自我繁殖（子账号拉人给自己提权）。邀请不传权限 = 空集（最小权限默认值）。
 */
public final class SellerGrants {

    public static final Set<String> GRANTABLE = Set.of(
            Permissions.PRODUCT_MANAGE,
            Permissions.ORDER_FULFILL,
            Permissions.ADDRESS_MANAGE,
            Permissions.SHIPPING_MANAGE);

    /** 规范化邀请/改权入参：null/空 → 空集；去重保序；白名单外（或 null 元素）一律 400 */
    public static List<String> sanitize(List<String> requested) {
        if (requested == null || requested.isEmpty()) {
            return List.of();
        }
        List<String> distinct = requested.stream().distinct().toList();
        for (String code : distinct) {
            Validate.isTrue(code != null && GRANTABLE.contains(code), "包含不可授予的权限码");
        }
        return distinct;
    }

    private SellerGrants() {}
}
