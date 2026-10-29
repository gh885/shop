package com.shop.platform.pricing.api;

import com.shop.platform.common.money.Money;
import java.util.List;
import java.util.UUID;

/**
 * trade 落单时用的同步命令。<b>必须在下单事务里调用。</b>
 */
public interface PricingQuery {

    /**
     * 校验报价单并把它置为 used。
     *
     * <p>校验三件事：报价还存在、没用过也没过期、当前购物车快照和报价时的输入一致。
     * 通过后返回总额，trade 据此插单；任一条不过就抛 {@code QUOTE_EXPIRED} 或 {@code PRICE_CHANGED}。
     */
    QuoteSnapshot consumeForOrder(UUID quoteId, PricingRequest current);

    /**
     * 报价单的成交快照。
     *
     * <p>刻意不复用 mapper 的行对象：那会让调用方 import {@code pricing.mapper}，而模块外只能看 {@code api}。
     *
     * <p>带逐行金额与分摊明细，是因为订单行要存"当时是什么"——trade 不能再回查 catalog 拿当前价格。
     */
    record QuoteSnapshot(
            UUID quoteId,
            String currency,
            Money goods,
            Money discount,
            Money shipping,
            Money payableAmount,
            List<LineSnapshot> lines,
            List<ShippingSnapshot> shippingByShop) {}

    /**
     * 一行的成交快照。
     *
     * @param lineNo 沿用报价单行号；trade 的 {@code order_line.line_no} 直接用它，不重新编号
     * @param discounts 本行承担的每条优惠，来自 {@code price_quote_rule.allocation}；可能为空
     */
    record LineSnapshot(
            int lineNo,
            UUID listingId,
            UUID skuId,
            UUID spuId,
            UUID merchantId,
            UUID shopId,
            UUID categoryId,
            UUID brandId,
            int quantity,
            Money unitAmount,
            Integer weightG,
            String title,
            String imageUrl,
            String specValuesJson,
            String identityKey,
            boolean sevenDayReturn,
            Money subtotal,
            Money discountAmount,
            Money payableAmount,
            List<DiscountSnapshot> discounts) {}

    /**
     * 一条优惠落在某一行上的金额。
     *
     * @param ruleVersion 与 {@code price_quote_rule.rule_version} 一致，退款要按它对齐
     * @param bearer 谁掏这笔钱；结算是按商家算的，缺了它结算基数就错
     */
    record DiscountSnapshot(UUID ruleId, String ruleVersion, String type, String bearer, Money amount) {}

    /** 每个店铺的运费。运费按店铺算，落进子单时按商家合并。 */
    record ShippingSnapshot(UUID shopId, UUID merchantId, Money amount) {}
}
