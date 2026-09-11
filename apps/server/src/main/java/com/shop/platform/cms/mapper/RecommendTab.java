package com.shop.platform.cms.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.cms.model.CmsStatus;
import com.shop.platform.infra.db.AuditedEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/** 推荐条词条 — 首页扁平导航 array 元素，首项 is_default=true 是"猜你喜欢"。 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("cms.recommend_tabs")
public class RecommendTab extends AuditedEntity {

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
}
