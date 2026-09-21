/**
 * Logistics 模块 —— 物流履约：包裹（shipments）与轨迹节点（tracking_nodes）。
 *
 * <p>schema: logistics。轨迹是 append-only 事实，包裹状态是它的<b>投影</b>：状态由节点码经 model 包的
 * {@code TrackingNodeCode} 映射表推导，且只允许沿 {@code ShipmentStatus} 的 rank 前进——快递推送乱序、迟到、
 * 重推是常态，<b>已签收不会被后来的「运输中」覆盖</b>，迟到的旧节点只落库不改状态。
 *
 * <p>与 order 的关系是单向的：发货入口在本模块（发货是物流动作），经 order :: api 的
 * {@code OrderCommand.markShipped / markDelivered} 推进订单状态并回写物流摘要与签收投影，
 * order 不认识物流——单向故不成环。一期曾是反向的事件（OrderShippedEvent），二期入口归一时删除：
 * 发货方已是本模块自己，再发事件给自己听没有意义。
 *
 * <p>对外只开一条 api 命令：aftersale 回寄时经 ReturnShipmentCommand 落 RETURN 包裹。
 * 承运商字典（carriers）与面单寄件人（ship_from_*，二期从 orders 归位）都归本模块；
 * 包裹状态是轨迹的投影，一单可多包裹（首次发货推进订单状态，之后只追加包裹）。
 * 不做取号/面单模板/计费对账——那属于承运商适配层，不属于领域模型。
 */
@ApplicationModule(
        displayName = "Logistics",
        allowedDependencies = {"order :: api", "shop :: api"})
package com.shop.platform.logistics;

import org.springframework.modulith.ApplicationModule;
