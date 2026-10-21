package com.shop.platform.pricing.api;

import com.shop.platform.common.money.Money;
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
     */
    record QuoteSnapshot(UUID quoteId, String currency, Money goods, Money discount, Money shipping, Money payable) {}
}
