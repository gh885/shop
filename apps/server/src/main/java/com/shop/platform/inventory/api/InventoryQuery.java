package com.shop.platform.inventory.api;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * 库存读侧的点查。只回答"还能卖几件"，不做任何写。
 *
 * <p>{@code availableToPromise} 允许为负：负值表示账上已经超卖，调用方应当把它当成异常状态展示，不要 clamp 成 0。
 */
public interface InventoryQuery {

    /** 可售量。没有库存行时返回 0——"没建过"和"卖光了"对买家是同一件事。 */
    int availableToPromise(UUID skuId);

    /**
     * 批查可售量，商品列表的"本页库存"用它。
     *
     * <p><b>为什么必须批量。</b> 一页商品 20 条、每条平均 5 个 SKU，逐个点查就是 100 次往返。
     * 商品列表是商家每天要打开几十次的页面。
     *
     * <p><b>跨仓聚合。</b> {@code inventory.stock} 的主键是 {@code (sku_id, warehouse_id)}，
     * 一个 SKU 可能在多个仓有货。点查那条只看 {@code Warehouse.DEFAULT}，因为下单路径
     * 只从默认仓发货；但列表要给商家看「我总共还有多少」，所以这里是求和。
     * 两个口径不同是有意的：前者是「现在能不能卖」，后者是「我还有多少货」。
     *
     * <p>查不到的 SKU 不在返回 Map 里（与 {@code CatalogQuery.findSellableByIds} 同一约定），
     * 调用方按 0 处理。
     */
    Map<UUID, Integer> availableBySkuIds(Collection<UUID> skuIds);
}
