package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.model.CategoryStatus;
import java.util.UUID;

/**
 * catalog.category 行投影——树结构的一行。只有描述位置需要的列——没有任何"配置"，
 * 时间列也不进投影（由数据库与触发器管，没有读路径用得上）。
 *
 * <p>叶子的判定住在这里（{@link #leaf()}），和 {@code level} 同一个真相源，不另存列。
 */
public record CategoryRow(
        UUID id, UUID parentId, String path, int level, String code, String name, CategoryStatus status, int sort) {

    /** 叶子层级。三层定死，前端 CATEGORY_MAX_LEVEL 也是这个数。 */
    public static final int LEAF_LEVEL = 3;

    /** 能不能往上挂商品：叶子 + active。frozen 只拦新建，closed 连下单都拦。 */
    public boolean mountable() {
        return leaf() && status.mountable();
    }

    public boolean leaf() {
        return level >= LEAF_LEVEL;
    }
}
