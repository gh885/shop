package com.shop.platform.inventory.api;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * 库存读侧的点查。只回答"还能卖几件"，不做任何写。
 *
 * <p><b>两个口径必须分开命名，不许合并。</b> 交易问的是「现在能不能卖」（默认仓，只有那一个仓发货），
 * 商家问的是「我还有多少货」（全仓求和）。同一个方法名给两种答案，调用方一定会在错误的场景里
 * 拿到一个"正确的"数字。
 *
 * <p>{@code availableToPromise} 允许为负：负值表示账上已经超卖，调用方应当把它当成异常状态展示，不要 clamp 成 0。
 */
public interface InventoryQuery {

    /** 可售量（默认仓）。没有库存行时返回 0——"没建过"和"卖光了"对买家是同一件事。 */
    int availableToPromise(UUID skuId);

    /**
     * 批查可售量（默认仓），商品详情页的「有货 / 售罄」用它。
     *
     * <p>口径与 {@link #availableToPromise} 完全相同：下单只从默认仓发，展示与成交必须同源。
     * 拿全仓求和来判「能不能买」，会出现「页面显示有 5，下单说不够」。
     *
     * <p>查不到的 SKU 不在返回 Map 里（与 {@code CatalogQuery.findSellableByIds} 同一约定），调用方按 0 处理。
     */
    Map<UUID, Integer> availableToPromiseByIds(Collection<UUID> skuIds);

    /**
     * 批查可售量，<b>跨仓求和</b>。商家商品列表的「我还有多少货」用它。
     *
     * <p><b>为什么必须批量。</b> 一页商品 20 条、每条平均 5 个 SKU，逐个点查就是 100 次往返。
     * 商品列表是商家每天要打开几十次的页面。
     *
     * <p>{@code inventory.stock} 的主键是 {@code (sku_id, warehouse_id)}，一个 SKU 可能在多个仓有货。
     * 这里求和所有仓，因为商家列表要问的是「我还有多少货」；{@link #availableToPromiseByIds} 只看默认仓，
     * 因为那才是「现在能不能卖」。名字里带 {@code AcrossWarehouses} 就是为了让下一个人
     * 不会顺手拿它去判能不能买。
     *
     * <p>查不到的 SKU 不在返回 Map 里，调用方按 0 处理。
     */
    Map<UUID, Integer> availableAcrossWarehouses(Collection<UUID> skuIds);

    /**
     * 批查四个科目，商家库存页用它——那里要显示的不只是"能卖几件"，
     * 还有"仓里到底有多少、压了多少安全库存、被订单锁了多少"。
     *
     * <p>只查默认仓：同一 SKU 在多个仓时，一张表里列两个仓的四科目是另一张页面的事（多仓未做）。
     *
     * <p>查不到的 SKU 不在返回 Map 里——"没建过库存行"是商家要看见的状态，
     * 不是需要被填成 0 的缺失值：他要先建一次，才谈得上改。
     */
    Map<UUID, StockAccount> stockAccounts(Collection<UUID> skuIds);

    /**
     * 一个 SKU 在默认仓的四个科目。
     *
     * <p>恒等式 {@code onHand = availableToPromise + reserved + safety} 由库约束保证，
     * 这里只是快照，不做第二份校验。
     */
    record StockAccount(UUID skuId, int onHand, int availableToPromise, int reserved, int safety) {}
}
