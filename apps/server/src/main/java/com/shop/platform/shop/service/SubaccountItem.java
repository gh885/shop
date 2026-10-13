package com.shop.platform.shop.service;

import com.shop.platform.account.api.SubaccountStatus;
import com.shop.platform.account.api.SubaccountSummary;
import com.shop.platform.common.PhoneNumber;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 子账号管理页的一行（店主视角）。
 *
 * <p>手机号一律掩码：列表是批量出参，批量出参不带别人的号码明文是 ACC-79 的立约，子账号这一格不例外
 * （号码是店主建的号没错，但它同时是员工的个人信息）。要看明文走逐条索取端点 {@code .../phone}，
 * 每一次索取在后端留一条痕迹。
 */
public record SubaccountItem(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String loginName,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String phone,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) SubaccountStatus status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<String> permissions,
        OffsetDateTime verifiedAt,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime createdAt) {

    /** 管理列表用：号码掩码 */
    public static SubaccountItem masked(SubaccountSummary row) {
        return new SubaccountItem(
                row.id(),
                row.loginName(),
                PhoneNumber.mask(row.phone()),
                row.status(),
                row.permissions(),
                row.verifiedAt(),
                row.createdAt());
    }
}
