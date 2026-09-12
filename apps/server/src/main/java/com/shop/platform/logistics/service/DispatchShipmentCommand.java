package com.shop.platform.logistics.service;

import java.util.UUID;

/**
 * 发货入参聚合（service 包内部类）：一次发货 = 一个包裹。
 *
 * <p>承运商只认字典 code——卖家发货不再收自由文本（老端点已删）。买家回寄那条路径不同，
 * 它可能只有手填的名字，走 {@code logistics :: api} 的 ReturnShipmentCommand，不经过本命令。
 */
public record DispatchShipmentCommand(UUID shopId, UUID orderId, String carrierCode, String trackingNo) {}
