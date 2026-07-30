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

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("product.categories")
public class Category {

    /** 根节点的 parent_id 占位值 */
    public static final UUID ROOT_PARENT_ID = new UUID(0L, 0L);

    @TableId(type = IdType.INPUT)
    private UUID id;

    private UUID parentId;

    private String name;

    /** 层级：1/2/3，service 层根据 parent 计算 */
    private Integer level;

    /** 同级排序权重 */
    private Integer sort;

    /** 1 启用 / 0 禁用，不做物理删除 */
    private Integer status;

    private String iconUrl;

    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
