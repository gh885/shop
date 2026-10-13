package com.shop.platform.account.service;

import com.shop.platform.account.api.SubaccountStatus;
import com.shop.platform.account.mapper.ShopSubaccount;
import com.shop.platform.common.PhoneNumber;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/**
 * 子账号的「我是谁」出参（{@code GET /auth/subaccount/me}）：卖家工作台的会话自述。
 *
 * <p>刻意<b>不</b>含店铺名：店名住在 shop 模块，账号域去读它就是 account → shop 的反向依赖（成环）。
 * 前端拿这里的 {@code shopId} 走匿名可达的 {@code GET /api/shops/{id}} 取店名与 logo——
 * 那本来就是买家侧也在用的公开读，不因为调用方是工作台就另开一条。
 *
 * <p>手机号掩码（与买家 {@code me} 同一口径，ACC-39）：自己的号也不在会话出参里给明文，
 * 明文只走「本人逐条索取」那类显式动作。
 */
public record SubaccountView(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID shopId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String loginName,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String phone,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) SubaccountStatus status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<String> permissions) {

    public static SubaccountView from(ShopSubaccount row) {
        return new SubaccountView(
                row.getId(),
                row.getShopId(),
                row.getLoginName(),
                PhoneNumber.mask(row.getPhone()),
                row.getStatus(),
                row.getPermissions() == null ? List.of() : List.copyOf(row.getPermissions()));
    }
}
