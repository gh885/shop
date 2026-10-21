package com.shop.platform.inventory.api;

import java.util.UUID;

/**
 * 库存读侧的点查。只回答"还能卖几件"，不做任何写。
 *
 * <p>{@code available} 允许为负：负值表示账上已经超卖，调用方应当把它当成异常状态展示，不要 clamp 成 0。
 */
public interface InventoryQuery {

    /** 可售量。没有库存行时返回 0——"没建过"和"卖光了"对买家是同一件事。 */
    int available(UUID skuId);
}
