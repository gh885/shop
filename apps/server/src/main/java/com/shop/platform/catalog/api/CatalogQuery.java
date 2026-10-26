package com.shop.platform.catalog.api;

import com.shop.platform.common.money.Money;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * 算价与下单要的商品事实：这个 SKU 现在能不能卖、多少钱、多重、属于哪个商家、长什么样。
 *
 * <p>一次给全，是因为算价和下单要在同一个快照上判断。分多次点查，中间商品可能被下架或被改，
 * 就会拼出一个不存在的组合。
 *
 * <p>带着标题、图片、规格，是为了让算价能把它们写进报价单——订单行要存"下单时是什么"，
 * 而 trade 不许回头查 catalog（那是竞态，也让订单金额和商品状态脱钩）。
 */
public interface CatalogQuery {

    /**
     * 按 SKU 点查可售事实。下架 / 不属于任何 online listing / SKU 已停用，一律返回空。
     *
     * <p>返回空不代表"商品不存在"，也不代表"不能买"——调用方按自己的错误码决定怎么说。
     */
    Optional<SellableSku> findSellable(UUID skuId);

    /**
     * 按 SKU 批查可售事实，购物车整车拼装与置灰判定用。语义与 {@link #findSellable} 完全一致，
     * 只是按集合取：查不到的键不在返回 Map 里，调用方据此置灰，不区分「不存在」和「不可售」。
     */
    Map<UUID, SellableSku> findSellableByIds(Collection<UUID> skuIds);

    /**
     * 按 SPU 批查可售事实，收藏列表用。
     *
     * <p>与 {@link #findSellableByIds} 同一语义（查不到的不在 Map 里），但粒度是 SPU——
     * 收藏的是商品不是规格。价格取该 SPU 全部 active SKU 的最低价，与详情页 minPrice 同口径。
     *
     * <p>{@code minPrice} 为 null 表示“还在卖但暂无报价”（SPU 有 online listing，
     * 但所有 SKU 都 disabled）。那不是不可售，两种情况展示不同，所以不用空集合表达。
     */
    Map<UUID, SellableSpu> findSellableSpusByIds(Collection<UUID> spuIds);

    /**
     * 收藏列表要的商品事实。只包含列表卡片能展示的东西——
     * 收藏页不需要规格矩阵、不需要属性，带上它们只会让每页多拉几十 KB。
     *
     * @param minPrice 最低价；null = 暂无报价（有 listing 但无 active SKU）
     */
    record SellableSpu(UUID spuId, String title, String imageUrl, Money minPrice) {}

    /**
     * @param listingId 买家实际看到的那个 listing；一个 SPU 在多个店挂售时，价格和商家由它决定
     * @param shopId 挂售的店铺。运费模板挂在店铺上，算价需要它——让 pricing 自己去 seller 查是跨模块越界
     * @param weightG SKU 重量，按重量计费时的唯一来源；null 表示商家没填
     * @param title 商品标题快照
     * @param imageUrl 主图快照，取 {@code spu_media} 的第一条通用图
     * @param specValuesJson 规格值 JSON 快照
     * @param identityKey 规格身份键，售后和比价要能认出是哪个规格
     */
    record SellableSku(
            UUID skuId,
            UUID spuId,
            UUID listingId,
            UUID merchantId,
            UUID shopId,
            UUID categoryId,
            UUID brandId,
            Money price,
            Integer weightG,
            String title,
            String imageUrl,
            String specValuesJson,
            String identityKey) {}
}
