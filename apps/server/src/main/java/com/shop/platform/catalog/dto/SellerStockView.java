package com.shop.platform.catalog.dto;

import java.util.List;
import java.util.UUID;

/**
 * 商家的库存页：这个商品下每个 SKU 的四科目。
 *
 * <p>四个科目都要给，不能只给可售量：商家要看的是「仓里有多少、被订单锁了多少、我压了多少安全库存、
 * 现在还能卖多少」。只给一个数字，他就没法解释「我明明有 100 件，为什么只能卖 80」。
 *
 * <p>可售允许为负：负值意味着账上已经超卖（盘亏或商家漏改）。
 * <b>前端不要 clamp 成 0</b>，那正好把唯一能看见问题的信号藏起来。
 *
 * @param stock 这个商品下的全部 SKU；没建过库存行的也在，用 {@code unbounded = true} 标出
 */
public record SellerStockView(UUID spuId, List<SkuStock> stock) {

    /**
     * @param onHand 仓里实际有多少件
     * @param availableToPromise 现在还能卖几件。可为负
     * @param reserved 被已付款订单锁住、还没发的量
     * @param safety 商家压住的安全库存
     * @param unbounded true = 这个 SKU 还没有库存行，商家还没填过数（此时四个科目都是 0）
     */
    public record SkuStock(
            UUID skuId, int onHand, int availableToPromise, int reserved, int safety, boolean unbounded) {}
}
