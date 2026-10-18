package com.shop.platform.logistics.service;

import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.order.events.OrderCancelledEvent;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 已付款订单取消 → 取消该单的待发货包裹（同步监听，同事务，与 aftersale 建整单退款单同一套路）。
 *
 * <p>类名刻意不叫 OrderCancelledListener：组件扫描按简单类名生成 bean 名，aftersale 已有一个同名监听器，
 * 两个同名类同存会让整个 Spring 上下文起不来（ConflictingBeanDefinitionException，实测栽过一次）。
 *
 * <p>为什么必须收口：待发货包裹占着「一单一张待发」的名额与<b>全局唯一的运单号</b>；
 * 订单都没了，这张包裹不可能再交寄（交寄时订单闸门会 409），不取消就是一个永远无路可走的占位——
 * 那个运单号从此无法用于任何其它订单。取消只释放名额：待发货没占过有效发货量，不动账本。
 *
 * <p>幂等：条件更新只看 {@code PENDING_DISPATCH}，重复事件只取消一次，已交寄的包裹不受影响
 * （货在路上，善后走售后）。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class PendingShipmentCleanupListener {

    private final ShipmentMapper shipmentMapper;

    @EventListener
    public void onOrderCancelled(OrderCancelledEvent event) {
        int cancelled = shipmentMapper.cancelPendingOfOrder(event.orderId(), OffsetDateTime.now());
        if (cancelled > 0) {
            log.info("[LOGISTICS] 订单取消，同步取消待发货包裹 {} 张, orderId={}", cancelled, event.orderId());
        }
    }
}
