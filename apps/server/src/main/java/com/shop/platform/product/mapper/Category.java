package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.product.model.CategoryStatus;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 商品分类 —— 邻接表实现的类目树。
 *
 * <p>同一张表通过 parentId 指向父分类（根节点用 ROOT_PARENT_ID 占位），level 1/2/3。 禁用不做物理删除：查询时把禁用节点整支剪掉，可无损恢复（见
 * CategoryService.buildTree）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("product.categories")
public class Category extends AuditedEntity {

    /** 根节点的 parent_id 占位值 */
    public static final UUID ROOT_PARENT_ID = new UUID(0L, 0L);

    /** 父分类 ID。邻接表存树，根节点的父用 ROOT_PARENT_ID 占位；创建后不可改（不支持移动节点） */
    private UUID parentId;

    /** 分类名。同级内唯一，由唯一索引 uk_categories_parent_name 兜底并发下的重名 */
    private String name;

    /** 层级：1/2/3，service 层根据 parent 计算 */
    private Integer level;

    /** 同级排序权重 */
    private Integer sort;

    /** 启用 / 禁用，不做物理删除。禁用节点查询时整支剪掉（不写扩散，可无损恢复），见 buildTree */
    private CategoryStatus status;

    public boolean isEnabled() {
        return status != null && status.isEnabled();
    }

    /** 分类图标 URL，前台类目入口展示用，可空 */
    private String iconUrl;
}
