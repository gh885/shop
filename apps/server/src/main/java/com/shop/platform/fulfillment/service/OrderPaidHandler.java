package com.shop.platform.fulfillment.service;

import com.shop.platform.fulfillment.mapper.ShipTaskStore;
import com.shop.platform.infra.event.EventInbox;
import com.shop.platform.trade.events.OrderPaid;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * 消费 {@code OrderPaid}，给每个子单建一条发货任务。
 *
 * <p>为什么要有这个任务：发货时效是履约的核心指标，而"承诺什么时候发"必须在付款那一刻定下来。
 * 没有它，商家发晚了平台无从判断，买家投诉也没有依据。
 *
 * <p><b>不在这里发货。</b> 发货是商家动作，事件只能提醒"该发了"。
 *
 * <p>{@code @ApplicationModuleListener} 自带事务，不能再加 {@code @Transactional}。
 */
@Component
public class OrderPaidHandler {

    private static final Logger log = LoggerFactory.getLogger(OrderPaidHandler.class);

    /**
     * 承诺发货时效。文档说按类目配、默认 48 小时；类目级的配置还没做，先用全局默认。
     *
     * <p>写在代码里而不是配置里，是因为它现在是唯一的值——做成可配会让人以为已经能按类目调了。
     */
    private static final Duration DEFAULT_SHIP_WINDOW = Duration.ofHours(48);

    private final ShipTaskStore shipTasks;
    private final EventInbox inbox;

    public OrderPaidHandler(ShipTaskStore shipTasks, EventInbox inbox) {
        this.shipTasks = Objects.requireNonNull(shipTasks, "shipTasks");
        this.inbox = Objects.requireNonNull(inbox, "inbox");
    }

    @ApplicationModuleListener
    public void on(OrderPaid event) {
        // 幂等闸门：事件可能被重投。下面的 createIfAbsent 是第二道（唯一索引 + DO NOTHING）
        if (!inbox.claim("fulfillment.order-paid", event.eventId())) {
            return;
        }

        Instant dueAt = event.paidAt().plus(DEFAULT_SHIP_WINDOW);
        for (OrderPaid.SellerOrderRef sellerOrder : event.sellerOrders()) {
            // 一个商家单一条任务。发多个包裹不影响它，第一个包裹发出就置 shipped
            shipTasks.createIfAbsent(sellerOrder.sellerOrderId(), sellerOrder.merchantId(), dueAt);
        }

        log.info(
                "已为订单 {} 建发货任务：{} 个子单，承诺发货 {}",
                event.orderGroupId(),
                event.sellerOrders().size(),
                dueAt);
    }
}
