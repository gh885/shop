package com.shop.platform.trade.api;

import java.util.Optional;
import java.util.UUID;

/**
 * 交易对外的只读点查。payment 发起支付、clearing 结算都要用它。
 *
 * <p>为什么应付金额必须从 trade 读：让调用方传金额，等于允许别处编一个数字去付。
 */
public interface TradeQuery {

    /**
     * 这一单现在该付多少。
     *
     * @return 空 = 订单不存在
     */
    Optional<Payable> findPayable(UUID orderGroupId);

    /**
     * @param payableNow 还能付吗：未付款、未关闭、未过期。false 时 payment 应拒绝发起支付
     */
    record Payable(
            UUID orderGroupId, UUID buyerId, long payableAmount, String currency, boolean payableNow, boolean paid) {}
}
