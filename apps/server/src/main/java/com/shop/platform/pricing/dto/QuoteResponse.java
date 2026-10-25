package com.shop.platform.pricing.dto;

import com.shop.platform.common.money.Money;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 结算页试算出参：确认订单页一屏的全部金额事实。
 *
 * <p>明细按<b>店铺</b>分组——运费按店铺算、未来拆子单也按店铺/商家拆，确认页每组的
 * 「商品小计 + 运费」将来就是 seller_order 的金额构成，一字不用换。分组里带行级商品快照
 * （标题/图/规格），因为订单行要存「下单时是什么」，而 trade 不许回查 catalog。
 *
 * <p>{@code unavailable} 是没进报价的行（已下架、挂售变化）：确认页置灰标注原因，
 * 用户剔除后才能下单。下单请求若混入这些行，报价单指纹对不上，落单自动拒（PRICE_CHANGED）。
 */
public record QuoteResponse(
        UUID quoteId,
        Instant expiresAt,
        Money goods,
        Money discount,
        Money shipping,
        Money payableAmount,
        List<Group> groups,
        List<UnavailableLine> unavailable) {

    /** 一个店铺一组：本店行明细 + 本店运费。shopName 缺失时为 null（店名是展示信息，不拦金额） */
    public record Group(UUID shopId, UUID merchantId, String shopName, Money shipping, List<Line> lines) {}

    /**
     * 一行明细。{@code specValues} 是规格键值的 JSON 原文（算价时钉的快照），展示层自行解析。
     */
    public record Line(
            int lineNo,
            UUID listingId,
            UUID skuId,
            UUID spuId,
            String title,
            String imageUrl,
            String specValues,
            int quantity,
            Money unitAmount,
            Money subtotal,
            Money discountAmount,
            Money payableAmount) {}

    /** 没进报价的行。cause：{@code UNAVAILABLE}=已下架/不可售；{@code OFFER_CHANGED}=挂售或归属已变化 */
    public record UnavailableLine(int lineNo, UUID skuId, String cause) {}
}
