package com.shop.platform.inventory.api;

import java.util.UUID;

/**
 * 库存只读视图：inventory.sku_stock 的跨模块投影，只带消费方真读的那两量。
 *
 * <p>冻结量（{@code frozen_stock}）刻意不在投影里：跨模块的读方一个都没碰它（三端界面也没有「冻结库存」这一格），
 * 它只是 {@link #availableStock()} 的算料，留在 {@code inventory.mapper.SkuStock} 里。
 * 带上一个没人读的字段，等于替所有消费方宣称「你需要它」。
 */
public record StockView(UUID skuId, int stock, int availableStock) {

    /**
     * 「查询没回这一行」时按 0 算——总库存与可用库存同一个答法。
     *
     * <p>批量取库存交回的是 {@code Map<skuId, StockView>}，缺 id 是可能的：正常写入路径上新 SKU 会由
     * {@code SkuService} 建行，但读侧不能据此假定人人都有行（历史数据、直接 SQL 造数都留得下空档）。
     * 要紧的不是概率而是口径——这条判断此前有五种写法：购物车、结算、商详、列表聚合各写一个
     * {@code view == null ? 0 : ...} 三元式，上架校验与改库存校验则当场 {@code new StockView(id, 0, 0, 0)}
     * 造一行假数据喂给 {@code getOrDefault}。同一个 SKU 因此可以在列表里显示有货、在结算页显示缺货，
     * 而「全店都没货」的上架闸门又按第三种写法判定。所以现在只在出口处回答一次。
     */
    public static int availableOrZero(StockView view) {
        return view == null ? 0 : view.availableStock();
    }

    /** 同一条口径的总量版：上架门槛问的是「有没有货」，不是「扣完冻结还剩多少」 */
    public static int stockOrZero(StockView view) {
        return view == null ? 0 : view.stock();
    }
}
