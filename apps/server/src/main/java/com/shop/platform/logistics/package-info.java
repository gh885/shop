/**
 * Logistics 模块 —— 物流履约：包裹（shipments）与轨迹节点（tracking_nodes）。
 *
 * <p>schema: logistics。轨迹是 append-only 事实，包裹状态是它的<b>投影</b>：状态由节点码经 model 包的
 * {@code TrackingNodeCode} 映射表推导，且只允许沿 {@code ShipmentStatus} 的 rank 前进——快递推送乱序、迟到、
 * 重推是常态，<b>已签收不会被后来的「运输中」覆盖</b>，迟到的旧节点只落库不改状态。
 *
 * <p>与 order 的关系是单向的：本模块只消费 order :: events 的 OrderShippedEvent（同步监听，同事务落包裹），
 * 不读 order :: api——事件已携带全部入参（orderId / userId / shopId / 承运商 / 运单号 / 发货时刻），
 * 出度为零，故不存在成环可能。买家侧查询的归属校验用包裹自己的 user_id，无需回查订单。
 *
 * <p>一期不建承运商字典（发货仍是自由文本、无消费者），不做取号/面单/计费对账——后者属于承运商适配层，
 * 不属于领域模型。二期发货入口归一后，orders 的物流两列改为本模块经 order :: api 写回的投影。
 */
@ApplicationModule(
        displayName = "Logistics",
        allowedDependencies = {"order :: events"})
package com.shop.platform.logistics;

import org.springframework.modulith.ApplicationModule;
