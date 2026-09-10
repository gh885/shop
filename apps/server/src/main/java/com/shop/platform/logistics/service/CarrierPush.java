package com.shop.platform.logistics.service;

import java.util.List;

/** 承运商推送（反方向）：运单号 + 该运单号的一批原始节点。 */
public record CarrierPush(String trackingNo, List<CarrierTrackingNode> nodes) {}
