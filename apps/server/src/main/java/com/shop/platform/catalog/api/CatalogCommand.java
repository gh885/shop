package com.shop.platform.catalog.api;

import java.util.Map;
import java.util.UUID;

/**
 * 商品命令（跨模块消费）：订单完成时累加 SPU 的销量投影。
 *
 * <p>在调用方（trade 完成事务）内同步执行：销量与「已完成」一起生效或一起回滚。
 * 只计已完成订单，取消/退款不回冲（V1 纯加总）；商品不存在时影响 0 行，不报错。
 */
public interface CatalogCommand {

    /** spuId → 本次成交数量（同一 SPU 多 SKU 由调用方先合并）。 */
    void addSold(Map<UUID, Integer> quantityBySpu);
}
