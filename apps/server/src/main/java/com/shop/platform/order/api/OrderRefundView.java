package com.shop.platform.order.api;

import com.shop.platform.common.Money;
import com.shop.platform.order.model.OrderStatus;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 订单退款视图：orders.orders 的跨模块投影，aftersale 发起/校验退款时读它。
 *
 * <p>金额三件套（实付 / 运费 / 已退）都在这里，是因为退款单行金额要服务端算：行实付、行已退在
 * {@link OrderRefundLineView}，运费只有本单一份、要在「整单退满」时单独成行（§6.2）。
 *
 * <p>可否申请用 {@link #refundOpenAt}，不要读 {@link #status()} 自行比较字面量——状态词表归 order 模块。
 */
public record OrderRefundView(
        UUID orderId,
        UUID tradeId,
        UUID userId,
        UUID shopId,
        String orderNo,
        OrderStatus status,
        Money payAmount,
        Money shippingFee,
        /** 已退（按行 + 运费），不含补偿 */
        Money refundedAmount,
        /** 已付补偿（与已退分开计数，§6.3） */
        Money compensatedAmount,
        OffsetDateTime applyExpireAt,
        /** 包裹签收时刻（logistics 推进到已签收时回填），未签收为 null */
        OffsetDateTime deliveredAt,
        /** 订单完成时刻（买家确认收货或确认收货窗口到期自动确认，同一时刻），未完成为 null */
        OffsetDateTime completedAt) {

    /**
     * 退款申请窗口是否开着：待收货（货在路上/已签收未确认）随时可申；完成后按申请截止时刻。
     *
     * <p>待发货不给入口——那一段买家的出口是取消整单退款（ORD-20），不必开第二条退款通道。
     */
    public boolean refundOpenAt(OffsetDateTime now) {
        return switch (status) {
            case SHIPPED -> true;
            case COMPLETED -> applyExpireAt != null && applyExpireAt.isAfter(now);
            default -> false;
        };
    }

    /**
     * 「买家收到商品」的时刻：签收优先（物流给的事实），未签收而买家已确认收货则按完成时刻（买家自己的自认）。
     * 两者皆无 = 说不上收到过（还在路上），消费方据此判定「无从起算」而不是猜一个。
     */
    public OffsetDateTime receivedAt() {
        return deliveredAt != null ? deliveredAt : completedAt;
    }
}
