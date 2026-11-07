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
            UUID orderGroupId,
            UUID buyerId,
            long payableAmount,
            String currency,
            boolean payableNow,
            boolean paid,
            /** 订单可付期限。发起支付时传给 payment，支付单不得比它+宽限活得久。 */
            java.time.Instant expiresAt) {}

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
     * @param shopId 子单所属店铺。卖家侧操作人另有店铺范围（operator_shop 授权），
     *     fulfillment 用它收窄——商家归属对了不代表这个店在他范围内
     * @param paid 未付款的订单不该发货
     * @param closed 已关闭的子单不能再发
     * @param lines 每一行还剩多少可发（{@code quantity - shippedQty - refundedQty}）。
     *     全为 0 表示没有要发的了——发完了，或没发就全退了（那种单不许再发）
     */
    record Shippable(
            UUID sellerOrderId,
            UUID orderGroupId,
            UUID merchantId,
            UUID shopId,
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
     * @param spuId 行商品的 SPU。评价按商品聚合要靠它，快照自订单行
     * @param imageUrl 行商品的图。评价/待评价卡片不回查 catalog，展示吃下单快照
     * @param specValuesJson 规格快照原文（jsonb）。评价卡「买的是哪个规格」直接展示它
     * @param remaining {@code quantity - shippedQty - refundedQty}；已退的件不许再发——
     *     全额退款未发货的单还能发货就是买家钱货两得。这个数只能由 trade 算，调用方不许自己减
     */
    record ShippableLine(
            UUID orderLineId,
            int lineNo,
            UUID skuId,
            UUID spuId,
            String title,
            String imageUrl,
            String specValuesJson,
            int quantity,
            int shippedQty,
            int remaining) {}

    /**
     * 售后要用的一行事实：这一行还能退几件、还能退多少钱。
     *
     * <p><b>上限由 trade 算，不让 returns 自己减。</b> 退款金额的上限是<b>实付</b>
     * （{@code payableAmount} 已经扣过优惠分摊），不是原价——按原价算就会退多。
     *
     * @return 空 = 订单行不存在
     */
    Optional<RefundableLine> findRefundable(UUID orderLineId);

    /** 同一份事实，按 (子单, 行号) 查：买家端只知道自己看到的行号，不知道行 id。 */
    Optional<RefundableLine> findRefundable(UUID sellerOrderId, int lineNo);

    /**
     * @param refundedQty 已经退过的件数
     * @param refundedAmount 已经退过的钱
     * @param payableAmount 这一行的实付（原价 × 数量 − 优惠分摊），退款上限就是它
     */
    record RefundableLine(
            UUID orderLineId,
            UUID sellerOrderId,
            UUID orderGroupId,
            UUID merchantId,
            UUID shopId,
            UUID buyerId,
            String currency,
            int quantity,
            int refundedQty,
            long payableAmount,
            long refundedAmount) {}
}
