package com.shop.platform.account.api;

import com.shop.platform.account.mapper.ShopSubaccount;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 子账号的管理视图（店铺侧子账号列表 / 明细用）。
 *
 * <p>{@code phone} 是<b>明文</b>：掩码是展示口径，由消费方按 ACC-79 那一套（默认掩码、要明文走逐条索取端点）
 * 自己决定——账号域不替别人的页面定「号码给看几位」（口径同 {@code UserReadQuery}）。
 */
public record SubaccountSummary(
        UUID id,
        UUID shopId,
        String loginName,
        String phone,
        SubaccountStatus status,
        List<String> permissions,
        OffsetDateTime verifiedAt,
        OffsetDateTime createdAt) {

    /** 实体 → 契约形状：跨模块只出这一种，店铺侧不 import 本模块的 mapper 实体 */
    public static SubaccountSummary from(ShopSubaccount row) {
        return new SubaccountSummary(
                row.getId(),
                row.getShopId(),
                row.getLoginName(),
                row.getPhone(),
                row.getStatus(),
                row.getPermissions() == null ? List.of() : List.copyOf(row.getPermissions()),
                row.getVerifiedAt(),
                row.getCreatedAt());
    }
}
