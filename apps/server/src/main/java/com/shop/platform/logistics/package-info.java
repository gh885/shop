/**
 * Logistics 模块 —— 物流履约：包裹（shipments）、发货单行（shipment_lines）与轨迹节点（tracking_nodes）。
 *
 * <p>schema: logistics。两条轴分开：<b>包裹履约</b>只有四态（待发货 / 已发出 / 已签收 / 已取消），
 * 状态是时间戳（{@code shipped_at / signed_at / cancelled_at}）的镜像，只经条件更新推进；
 * <b>轨迹节点</b>是 append-only 的展示流水，节点码经 {@code TrackingNodeCode → TrackingStage} 投影成阶段，
 * 承运商推送乱序、迟到、重推都不会改写履约状态（迟到的旧节点只落库）。
 *
 * <p>发货粒度是「订单行 + 数量」（{@code shipment_lines}）：录单只占住这批行，交寄才把件数累加进
 * 订单行账本（{@code orders.items.shipped_quantity / settled_quantity}），再由 order 按事实重算履约态。
 *
 * <p>与 order 的关系是单向的：发货入口在本模块（发货是物流动作），经 order :: api 的
 * {@code OrderCommand} 推进订单、写回物流摘要与签收投影，order 不认识物流——单向故不成环。
 *
 * <p>对外只开一条 api 命令：aftersale 回寄时经 ReturnShipmentCommand 落 RETURN 包裹。
 * 承运商字典（carriers）与面单寄件人（ship_from_*）都归本模块；一单可多包裹。
 * 不做取号/面单模板/计费对账——那属于承运商适配层，不属于领域模型。
 */
@ApplicationModule(
        displayName = "Logistics",
        allowedDependencies = {"order :: api", "shop :: api", "account :: api", "audit :: api"})
package com.shop.platform.logistics;

import org.springframework.modulith.ApplicationModule;
