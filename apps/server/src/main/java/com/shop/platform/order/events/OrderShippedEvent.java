package com.shop.platform.order.events;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 卖家发货事件：发货的条件转移（PAID → SHIPPED）成功后，在发货事务内发布一次。
 *
 * <p>携带落包裹所需的全部入参（买家 / 店铺 / 承运商 / 运单号 / 发货时刻），使消费方不必回读订单——
 * logistics 因此对 order 出度为零，单向依赖不成环。
 *
 * <p>logistics 同步监听落一行正向包裹（同事务）：包裹落不下则发货整体回滚，
 * "发过货就一定有包裹"是硬约束。事件归生产方 order 所有（AGENTS「事件归生产方」）。
 */
public record OrderShippedEvent(
        UUID orderId, UUID userId, UUID shopId, String carrierName, String trackingNo, OffsetDateTime shippedAt) {}
