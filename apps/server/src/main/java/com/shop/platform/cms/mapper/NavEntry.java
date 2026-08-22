package com.shop.platform.cms.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 首页分类导航条目 — 前端 NavEntry。subs 为 JSONB 子分组，整段配置，不拆表。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName(value = "cms.nav_entries", autoResultMap = true)
public class NavEntry {

    /** 状态见 status 字段 javadoc：1 启用 / 0 停用 */
    public static final int STATUS_ENABLED = 1;

    public static final int STATUS_DISABLED = 0;

    /** 主键。应用层生成 uuidv7 */
    @TableId(type = IdType.INPUT)
    private UUID id;

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

    /** 1 启用 / 0 停用，不做物理删除 */
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
