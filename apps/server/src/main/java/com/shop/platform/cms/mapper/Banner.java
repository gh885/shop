package com.shop.platform.cms.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.cms.model.CmsStatus;
import com.shop.platform.infra.db.AuditedEntity;
import java.time.OffsetDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/** 运营位 banner — 位置 × 内容，slot 标识运营位（如 home_promo）。 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("cms.banners")
public class Banner extends AuditedEntity {

    /** 运营位标识：'home_promo'，可扩 home_sidebar / flash_sale */
    private String slot;

    /** 主标题，如「家电焕新季」 */
    private String title;

    /** 副标题 */
    private String subtitle;

    /** 图片 URL */
    private String imageUrl;

    /** 跳转目标，软关联 */
    private String target;

    /** 目标类型，词表见 {@link com.shop.platform.cms.dto.LinkTarget} */
    private String targetType;

    /** 仅 targetType=URL 用 */
    private String link;

    /** 同级排序权重 */
    private Integer sortOrder;

    /** 启用 / 停用，不做物理删除 */
    private CmsStatus status;

    /** 定时生效：null 表示立即生效，不参与时间过滤 */
    private OffsetDateTime startAt;

    /** 定时失效：null 表示不失效 */
    private OffsetDateTime endAt;

    /** 生效窗口是否自洽：两端齐时 endAt 必须晚于 startAt（相等即零窗口）；任一端 null 不受该端约束 */
    public boolean isTimeRangeValid() {
        return startAt == null || endAt == null || endAt.isAfter(startAt);
    }
}
