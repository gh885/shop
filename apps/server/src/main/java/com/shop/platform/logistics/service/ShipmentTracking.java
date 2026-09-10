package com.shop.platform.logistics.service;

import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.TrackingNode;
import java.util.List;

/**
 * 物流轨迹视图（service 出参形状）—— 包裹摘要 + 按事件时刻正序的节点列表。
 *
 * <p>装的是"看物流要什么"：买家侧展示与卖家侧作业复用同一形状，字段的展示取舍（文案、图标、脱敏）留在前端。
 */
public record ShipmentTracking(Shipment shipment, List<TrackingNode> nodes) {}
