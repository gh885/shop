package com.shop.platform.inventory.model;

import java.util.UUID;

/**
 * 默认仓。
 *
 * <p>MVP 只有一本账，不做多仓：买家下单、商家改库存都不需要指定仓库，所以用全零 UUID 占位。
 * 多仓上线时这个常量被删掉，调用方改成显式传 {@code warehouseId}——它在那儿放着，就是为了让"没有仓"这件事
 * 有个明确的名字，而不是在 SQL 里散落一堆 {@code gen_random_uuid()}。
 */
public final class Warehouse {

    public static final UUID DEFAULT = new UUID(0L, 0L);

    private Warehouse() {}
}
