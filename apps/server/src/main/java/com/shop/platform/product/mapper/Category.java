package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 商品分类 —— 邻接表实现的类目树。
 *
 * <p>同一张表通过 parentId 指向父分类（根节点用 ROOT_PARENT_ID 占位），level 1/2/3。 禁用不做物理删除：查询时把禁用节点整支剪掉，可无损恢复（见
 * CategoryService.buildTree）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("product.categories")
public class Category {

    /** 根节点的 parent_id 占位值 */
    public static final UUID ROOT_PARENT_ID = new UUID(0L, 0L);

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 父分类 ID。邻接表存树，根节点的父用 ROOT_PARENT_ID 占位；创建后不可改（不支持移动节点） */
    private UUID parentId;

    /** 分类名。同级内唯一，由唯一索引 uk_categories_parent_name 兜底并发下的重名 */
    private String name;

    /** 层级：1/2/3，service 层根据 parent 计算 */
    private Integer level;

    /** 同级排序权重 */
    private Integer sort;

    /** 1 启用 / 0 禁用，不做物理删除。禁用节点查询时整支剪掉（不写扩散，可无损恢复），见 buildTree */
    private Integer status;

    /** 分类图标 URL，前台类目入口展示用，可空 */
    private String iconUrl;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
