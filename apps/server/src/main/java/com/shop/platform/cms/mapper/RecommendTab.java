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

/** 推荐条词条 — 首页扁平导航 array 元素，首项 is_default=true 是"猜你喜欢"。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("cms.recommend_tabs")
public class RecommendTab {

    /** 主键。应用层生成 uuidv7 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 词条名，如「猜你喜欢」/「运动户外」/「+更多」 */
    private String name;

    /** 跳转目标，软关联 */
    private String target;

    /** 目标类型：PRODUCT/CATEGORY/CAMPAIGN/SEARCH/URL */
    private String targetType;

    /** 是否默认选中项（"猜你喜欢"），同一时刻应唯一 */
    private Boolean isDefault;

    /** 同级排序权重 */
    private Integer sortOrder;

    /** 启用 / 停用，不做物理删除 */
    private CmsStatus status;

    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
