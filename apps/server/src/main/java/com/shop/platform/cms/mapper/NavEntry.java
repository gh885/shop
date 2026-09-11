package com.shop.platform.cms.mapper;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.cms.model.CmsStatus;
import com.shop.platform.infra.db.AuditedEntity;
import java.util.List;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/** 首页分类导航条目 — 前端 NavEntry。subs 为 JSONB 子分组，整段配置，不拆表。 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName(value = "cms.nav_entries", autoResultMap = true)
public class NavEntry extends AuditedEntity {

    /** 导航位标识：'home'，预留多导航位 */
    private String navKey;

    /** 主条目标题，如「冰洗/空调/电视/厨卫大电」 */
    private String title;

    /** 图标 key（前端映射 lucide），如 'refrigerator' */
    private String iconKey;

    /** 跳转目标，软关联，不 join 业务模块 */
    private String target;

    /** 目标类型：PRODUCT/CATEGORY/CAMPAIGN/SEARCH/URL */
    private String targetType;

    /** 子分组 [{name,items[]}]，JSONB */
    @TableField(typeHandler = JsonbNavGroupListHandler.class)
    private List<NavGroup> subs;

    /** 同级排序权重 */
    private Integer sortOrder;

    /** 启用 / 停用，不做物理删除 */
    private CmsStatus status;
}
