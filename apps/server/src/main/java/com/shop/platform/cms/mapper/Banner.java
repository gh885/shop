package com.shop.platform.cms.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.cms.model.CmsStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 运营位 banner — 位置 × 内容，slot 标识运营位（如 home_promo）。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("cms.banners")
public class Banner {

    /** 主键。应用层生成 uuidv7 */
    @TableId(type = IdType.INPUT)
    private UUID id;

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

    /** 目标类型：PRODUCT/CATEGORY/CAMPAIGN/SEARCH/URL */
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

    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
