package com.shop.platform.order.api;

import com.shop.platform.common.Money;
import com.shop.platform.order.model.OrderStatus;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 订单售后视图：orders.orders 的跨模块投影（aftersale 申请前置校验 + 退款口径来源 + 无理由窗口起算）。
 * 可否申请用 {@link #afterSaleOpenAt}，不要读 {@link #status()} 自行比较字面量——状态词表归 order 模块，消费方只吃谓词。
 */
public record OrderAfterSaleView(
        UUID userId,
        UUID shopId,
        OrderStatus status,
        OffsetDateTime applyExpireAt,
        Money payAmount,
        /** 包裹签收时刻（logistics 推进到已签收时回填），未签收为 null */
        OffsetDateTime deliveredAt,
        /** 订单完成时刻（买家确认收货或确认收货窗口到期自动确认，同一时刻），未完成为 null */
        OffsetDateTime completedAt) {

    /** 售后申请窗口是否开着：待收货（货在路上/已签收未确认）随时可申；完成后按申请截止时刻 */
    public boolean afterSaleOpenAt(OffsetDateTime now) {
        return switch (status) {
            case SHIPPED -> true;
            case COMPLETED -> applyExpireAt != null && applyExpireAt.isAfter(now);
            default -> false;
        };
    }

    /**
     * 「买家收到商品」的时刻：签收优先（物流给的事实），未签收而买家已确认收货则按完成时刻（买家自己的自认）。
     * 两者皆无 = 说不上收到过（还在路上），消费方据此判定「无从起算」而不是猜一个。
     *
     * <p>为什么这个谓词在 order 侧：它说的不是售后规则，而是「什么时候算收到」——签收与完成两列归本模块，
     *  aftersale 只拿这个时刻去量自己的窗口天数。
     */
    public OffsetDateTime receivedAt() {
        return deliveredAt != null ? deliveredAt : completedAt;
    }
}
