package com.shop.platform.cms.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.cms.mapper.Banner;
import com.shop.platform.cms.model.CmsStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Banner 出参：管理端与公开端共用（CmsContentAdminController / CmsPublicController 都直出这个形状）。
 *
 * <p>位置就在本模块 service 包顶层（规范里的「service 出参形状类 XxxView」），不是 controller 包内类也不是
 * 内部类：跨 controller 复用靠的正是这一个承载者，两个 controller 各自 map {@code BannerView::from}，
 * 不再造第二份 Response。NamingRulesTest 允许 handler 直出 service 形状类，「Response 后缀只出现在
 * controller 包」那条管不到它——wire 上的名字由下面的 {@code @Schema(name = "BannerResponse")} 给定，
 * 沿用 SDK 既有类型名。
 *
 * <p>字段镜像实体现状，且它就是契约本体：删字段或改类型会让前端生成的 responseValidator（zBannerResponse，
 * 由 openapi 契约生成，未开 strict）当场拒；加字段 validator 不报错（未知键被剥离），但照样是改接口。
 */
@Schema(name = "BannerResponse")
public record BannerView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String slot,
        @Schema(requiredMode = REQUIRED) String title,
        @Schema(requiredMode = REQUIRED, nullable = true) String subtitle,
        @Schema(requiredMode = REQUIRED) String imageUrl,
        @Schema(requiredMode = REQUIRED, nullable = true) String target,
        @Schema(requiredMode = REQUIRED, nullable = true) String targetType,
        @Schema(requiredMode = REQUIRED, nullable = true) String link,
        @Schema(requiredMode = REQUIRED) Integer sortOrder,
        @Schema(requiredMode = REQUIRED) CmsStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime startAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime endAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static BannerView from(Banner b) {
        return new BannerView(
                b.getId(),
                b.getSlot(),
                b.getTitle(),
                b.getSubtitle(),
                b.getImageUrl(),
                b.getTarget(),
                b.getTargetType(),
                b.getLink(),
                b.getSortOrder(),
                b.getStatus(),
                b.getStartAt(),
                b.getEndAt(),
                b.getCreatedAt(),
                b.getUpdatedAt());
    }
}
