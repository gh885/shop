package com.shop.platform.trade.api;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 交易对外的只读点查。payment 发起支付、fulfillment 发货、clearing 结算都要用它。
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

    /**
     * 一个商家单的可发货形状：属于谁、发了多少、还剩多少。
     *
     * <p>fulfillment 发货前必须调它校验数量上限。**不让 fulfillment 自己查 trade 的表**——
     * 那是跨模块写别人的数据；也**不让它相信前端传的数量**——超发就是超卖。
     *
     * @return 空 = 子单不存在
     */
    Optional<Shippable> findShippable(UUID sellerOrderId);

    /**
     * @param merchantId 归属商家。fulfillment 用它与当前操作人的 {@code merchantId} 比对
     * @param paid 未付款的订单不该发货
     * @param closed 已关闭的子单不能再发
     * @param lines 每一行还剩多少可发（{@code quantity - shippedQty}）。全为 0 表示已发完
     */
    record Shippable(
            UUID sellerOrderId,
            UUID orderGroupId,
            UUID merchantId,
            String currency,
            boolean paid,
            boolean closed,
            String fulfillmentStatus,
            List<ShippableLine> lines) {

        /** 还能不能发：已付款、未关闭、还有没发完的行。 */
        public boolean shippable() {
            return paid && !closed && lines.stream().anyMatch(line -> line.remaining() > 0);
        }

        /** 按行号找行。找不到返回空，调用方据此报"这个订单没有这一行"。 */
        public java.util.Optional<ShippableLine> line(int lineNo) {
            return lines.stream().filter(line -> line.lineNo() == lineNo).findFirst();
        }

        /** 按订单行 id 找行。fulfillment 只存了 id，展示时要用它换回行号。 */
        public java.util.Optional<ShippableLine> lineOf(UUID orderLineId) {
            return lines.stream()
                    .filter(line -> line.orderLineId().equals(orderLineId))
                    .findFirst();
        }
    }

    /**
     * @param remaining {@code quantity - shippedQty}；这个数只能由 trade 算，调用方不许自己减
     */
    record ShippableLine(
            UUID orderLineId, int lineNo, UUID skuId, String title, int quantity, int shippedQty, int remaining) {}
}
