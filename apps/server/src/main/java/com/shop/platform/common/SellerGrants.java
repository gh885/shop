package com.shop.platform.common;

import java.util.List;
import java.util.Set;

/**
 * 卖家侧可授予子账号的权限码白名单与入参规范化。
 *
 * <p>住在 {@code common} 而不是 {@code shop.service}：这份白名单现在有两个实施点——店铺侧的子账号管理端点
 * （店主勾权限）与账号侧的建号/改权命令。放店铺模块里，账号侧就只能「相信调用方已经过滤过了」，
 * 而「防子账号自我提权」这条不变式不该靠一句信任维持。
 *
 * <p>白名单只有五个码：{@code MEMBER_MANAGE} / {@code SHOP_MANAGE} 是 OWNER 固有、不入可授予集合
 * ——防权限自我繁殖（子账号拉人给自己提权）。不传权限 = 空集（最小权限默认值）。
 */
public final class SellerGrants {

    public static final Set<String> GRANTABLE = Set.of(
            Permissions.PRODUCT_MANAGE,
            Permissions.ORDER_FULFILL,
            Permissions.ADDRESS_MANAGE,
            Permissions.SHIPPING_MANAGE,
            Permissions.COUPON_MANAGE);

    /** 规范化建号/改权入参：null/空 → 空集；去重保序；白名单外（或 null 元素）一律 400 */
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
