package com.shop.platform.catalog.mapper;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.catalog.model.CategoryStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * catalog.category 行映射——树结构的一行。只有描述位置需要的列——没有任何"配置"。
 *
 * <p>时间列由数据库管：created_at 靠列默认 now()，updated_at 由 {@code trg_category_touch}
 * 触发器维护。两个字段对 insert/update 都封闭（{@link FieldStrategy#NEVER}），实体不背时间语义，
 * 也杜绝「读出来再整行回写」把别人的写入盖掉。
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@TableName("catalog.category")
public class CategoryEntity {

    /** 叶子层级。三层定死，前端 CATEGORY_MAX_LEVEL 也是这个数。 */
    public static final int LEAF_LEVEL = 3;

    /** 应用侧生成（Ids.newId()），不走数据库默认。 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    private UUID parentId;
    private String path;

    /** 层级 1..3。3 才是叶子，{@link #leaf()} 由它推导，不存列 */
    private int level;

    private String code;
    private String name;
    private CategoryStatus status;
    private int sort;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private OffsetDateTime createdAt;

    @TableField(insertStrategy = FieldStrategy.NEVER, updateStrategy = FieldStrategy.NEVER)
    private OffsetDateTime updatedAt;

    /** 能不能往上挂商品：叶子 + active。frozen 只拦新建，closed 连下单都拦。 */
    public boolean mountable() {
        return leaf() && status.mountable();
    }

    public boolean leaf() {
        return level >= LEAF_LEVEL;
    }
}
