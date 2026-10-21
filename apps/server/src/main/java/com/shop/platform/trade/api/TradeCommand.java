package com.shop.platform.trade.api;

import com.shop.platform.common.money.Money;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * trade 对外的同步入口。
 *
 * <p>三条边界：
 *
 * <ul>
 *   <li><b>落单</b>是唯一写订单的入口，必须带 {@code quoteId}，金额从报价单读
 *   <li><b>支付成功</b>由 {@code PaymentSucceeded} 事件驱动，不是买家点按钮
 *   <li>其它模块要改订单，走这里的命令，不许直接写 trade 的表
 * </ul>
 */
public interface TradeCommand {

    /**
     * 落单：校验报价 → 占库存 → 插三层订单 → 发事件，全在一个事务里。
     *
     * @throws com.shop.platform.common.BusinessException {@code PRICE_CHANGED} / {@code QUOTE_EXPIRED} /
     *     {@code INSUFFICIENT_STOCK}，任何一个都让整单回滚
     */
    PlacedOrder placeOrder(PlaceOrderRequest request);

    /**
     * 未付款时取消整单。
     *
     * <p>先子单 {@code closed_reason}、再组 {@code closed_at}，同一事务；只写组的话子单还开着，
     * 买家页和商家页会显示两个状态。
     *
     * @return false = 已经被支付回调或别的请求抢先，什么都没改
     */
    boolean cancelUnpaid(UUID orderGroupId, UUID buyerId);

    /**
     * 超时关单。与支付回调用**同一个前置条件**，谁改到行谁赢。
     *
     * @return false = 支付回调赢了，这单不该关
     */
    boolean closeExpired(UUID orderGroupId);

    /** 落单结果。{@code groupNo} 是买家看到的号。 */
    record PlacedOrder(UUID orderGroupId, String groupNo, List<UUID> sellerOrderIds, Money payable, Instant expireAt) {}
}
