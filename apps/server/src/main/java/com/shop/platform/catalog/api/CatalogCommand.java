package com.shop.platform.catalog.api;

import java.util.Map;
import java.util.UUID;

/**
 * 商品命令（跨模块消费）：销量投影的加与回冲。
 *
 * <p>在调用方（trade 的完成/退款事务）内同步执行：销量与订单事实一起生效或一起回滚。
 * 口径是<b>净件数</b>：完成时按 {@code quantity - refunded_qty} 加；完成后的退款按退掉件数减
 * （调用方只对已完成组调 {@code decSold}）。商品不存在时影响 0 行，不报错。
 */
public interface CatalogCommand {

    /** spuId → 本次成交数量（同一 SPU 多 SKU 由调用方先合并）。 */
    void addSold(Map<UUID, Integer> quantityBySpu);

    /** spuId → 本次退掉数量。只该由已完成订单的退款触发，{@code GREATEST} 兜底不为负。 */
    void decSold(Map<UUID, Integer> quantityBySpu);
}
