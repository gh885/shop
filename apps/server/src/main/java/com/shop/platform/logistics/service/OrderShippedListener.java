package com.shop.platform.logistics.service;

import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.order.events.OrderShippedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 卖家发货落包裹：监听 order 的 {@link OrderShippedEvent}，在发货事务内同步落一行正向包裹（待揽收）。
 *
 * <p>同事务是刻意的：<b>发过货就一定有包裹</b>——包裹落不下则发货整体回滚，订单不会停在一个查不到物流的状态。
 * 事件已携带全部入参，故本模块不必回读 order（出度为零，无成环可能）。
 *
 * <p>此刻不伪造任何轨迹节点：轨迹是承运商的事实，"卖家已发货、等待揽收"由包裹的 shipped_at 与
 * PENDING_PICKUP 状态表达，不假装承运商说了话。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class OrderShippedListener {

    private final ShipmentMapper shipmentMapper;

    @EventListener
    public void onOrderShipped(OrderShippedEvent event) {
        shipmentMapper.insert(Shipment.builder()
                .orderId(event.orderId())
                .userId(event.userId())
                .shopId(event.shopId())
                .direction(ShipmentDirection.FORWARD)
                .carrierName(event.carrierName())
                .trackingNo(event.trackingNo())
                .status(ShipmentStatus.PENDING_PICKUP)
                .shippedAt(event.shippedAt())
                .build());
        log.debug(
                "[LOGISTICS] 发货落包裹, orderId={}, 运单号={}, 承运商={}",
                event.orderId(),
                event.trackingNo(),
                event.carrierName());
    }
}
