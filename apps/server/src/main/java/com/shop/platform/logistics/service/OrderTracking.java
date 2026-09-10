package com.shop.platform.logistics.service;

import java.util.List;
import java.util.UUID;

/**
 * 订单物流视图（service 出参形状）：一笔订单的全部包裹，各自带轨迹节点。
 *
 * <p>一单多包裹是二期的常态（拆包/分批发），所以订单级查询返回列表而不是单个包裹；
 * 展示顺序 = 发货先后，前端把首个包裹当摘要、其余折叠。
 */
public record OrderTracking(UUID orderId, List<ShipmentTracking> shipments) {}
