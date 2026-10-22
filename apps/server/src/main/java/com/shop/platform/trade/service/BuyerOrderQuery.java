package com.shop.platform.trade.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.money.Money;
import com.shop.platform.trade.mapper.BuyerOrderReadStore;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 买家侧订单读模型。
 *
 * <p><b>走主库，不走搜索索引。</b> 刚下的单在索引里搜不到是经典事故——写侧还没投递，
 * 买家刷新页面就看到"没有订单"，然后去点第二次。
 *
 * <p>归属校验在这里，不在 controller：{@code buyerId} 和订单必须在这里对一次，
 * 这是买家侧唯一的数据边界，漏了就是任何登录用户都能看别人订单。
 */
@Component
public class BuyerOrderQuery {

    private final BuyerOrderReadStore store;

    public BuyerOrderQuery(BuyerOrderReadStore store) {
        this.store = Objects.requireNonNull(store, "store");
    }

    public OrderDetail detail(UUID orderGroupId, UUID buyerId) {
        BuyerOrderReadStore.GroupRow group =
                store.findGroup(orderGroupId).orElseThrow(() -> BusinessException.notFound("订单不存在: " + orderGroupId));

        if (!group.buyerId().equals(buyerId)) {
            // 404 而不是 403：告诉对方"这个 id 存在但不是你的"本身就是一次信息泄露
            throw BusinessException.notFound("订单不存在: " + orderGroupId);
        }

        return new OrderDetail(
                group.id(),
                group.groupNo(),
                group.displayStatus(),
                new Money(group.payableAmount(), group.currency()),
                new Money(group.paidAmount(), group.currency()),
                group.shipAddress(),
                group.expireAt(),
                group.createdAt(),
                store.findSellerOrders(orderGroupId).stream()
                        .map(sellerOrder -> new SellerOrderView(
                                sellerOrder.id(),
                                sellerOrder.orderNo(),
                                sellerOrder.shopId(),
                                sellerOrder.fulfillmentStatus(),
                                sellerOrder.closedReason(),
                                new Money(sellerOrder.payableAmount(), sellerOrder.currency()),
                                store.findLines(sellerOrder.id()).stream()
                                        .map(line -> new LineView(
                                                line.lineNo(),
                                                line.skuId(),
                                                line.title(),
                                                line.imageUrl(),
                                                line.specValuesJson(),
                                                line.quantity(),
                                                line.shippedQty(),
                                                line.receivedQty(),
                                                new Money(line.unitAmount(), line.currency()),
                                                new Money(line.payable(), line.currency())))
                                        .toList()))
                        .toList());
    }

    public List<OrderSummary> list(UUID buyerId, int limit) {
        return store.findByBuyer(buyerId, limit).stream()
                .map(row -> new OrderSummary(
                        row.id(),
                        row.groupNo(),
                        row.displayStatus(),
                        new Money(row.payableAmount(), row.currency()),
                        row.createdAt()))
                .toList();
    }

    /**
     * 展示态。
     *
     * <p><b>不存这一列，是算出来的。</b> 存了就有第二处真相：订单行的发货计数器一改，
     * 展示态要么忘了同步、要么同步成错的。
     *
     * <p>订单组只看支付和关闭两个维度——它没有履约状态。所以这里只能回答
     * "待付款 / 已付款 / 已取消 / 已退款"，发货进度在子单上。
     */
    public record OrderSummary(UUID orderGroupId, String groupNo, String status, Money payable, Instant createdAt) {}

    public record OrderDetail(
            UUID orderGroupId,
            String groupNo,
            String status,
            Money payable,
            Money paid,
            String shipAddressJson,
            Instant expireAt,
            Instant createdAt,
            List<SellerOrderView> sellerOrders) {}

    public record SellerOrderView(
            UUID sellerOrderId,
            String orderNo,
            UUID shopId,
            String fulfillmentStatus,
            String closedReason,
            Money payable,
            List<LineView> lines) {}

    public record LineView(
            int lineNo,
            UUID skuId,
            String title,
            String imageUrl,
            String specValuesJson,
            int quantity,
            int shippedQty,
            int receivedQty,
            Money unitAmount,
            Money payable) {}
}
