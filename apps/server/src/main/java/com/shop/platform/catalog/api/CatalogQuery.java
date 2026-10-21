package com.shop.platform.catalog.api;

import com.shop.platform.common.money.Money;
import java.util.UUID;

/**
 * 算价与下单要的商品事实：这个 SKU 现在能不能卖、多少钱、多重、属于哪个商家。
 *
 * <p>把四件事一次给全，是因为算价和下单要在同一个快照上判断。分四次点查，中间商品可能被下架，
 * 就会拼出一个不存在的组合。
 */
public interface CatalogQuery {

    /**
     * 按 SKU 点查可售事实。下架 / 不属于任何 online offer / SKU 已停用，一律返回空。
     *
     * <p>返回空不代表"商品不存在"，也不代表"不能买"——调用方按自己的错误码决定怎么说。
     */
    java.util.Optional<SellableSku> findSellable(UUID skuId);

    /**
     * @param offerId 买家实际看到的那个 offer；一个 SPU 在多个店挂售时，价格和商家由它决定
     * @param shopId 挂售的店铺。运费模板挂在店铺上，算价需要它——让 pricing 自己去 seller 查是跨模块越界
     * @param weightG SKU 重量，按重量计费时的唯一来源；null 表示商家没填
     */
    record SellableSku(
            UUID skuId,
            UUID spuId,
            UUID offerId,
            UUID merchantId,
            UUID shopId,
            UUID categoryId,
            Money price,
            Integer weightG) {}
}
