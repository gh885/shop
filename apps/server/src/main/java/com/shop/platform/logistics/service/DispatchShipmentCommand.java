package com.shop.platform.logistics.service;

import java.util.UUID;

/**
 * 发货入参聚合（service 包内部类）：一次发货 = 一个包裹。
 *
 * <p>两个入口共用它：新端点给 {@code carrierCode}（字典主路径），老端点只有手填的名字
 * （{@code carrierCode} 为 null，{@code carrierName} 为原文）——差异只在取参，落库与推进逻辑逐字相同。
 */
public record DispatchShipmentCommand(
        UUID shopId, UUID orderId, String carrierCode, String carrierName, String trackingNo) {}
