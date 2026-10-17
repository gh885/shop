package com.shop.platform.logistics.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 录单入参聚合（service 包内部类）：一次录单 = 一个包裹 + 它装了哪些订单行的多少件。
 *
 * <p>承运商只认字典 code——卖家发货不再收自由文本（老端点已删）。买家回寄那条路径不同，
 * 它可能只有手填的名字，走 {@code logistics :: api} 的 ReturnShipmentCommand，不经过本命令。
 */
public record DispatchShipmentCommand(
        UUID shopId, UUID orderId, String carrierCode, String trackingNo, List<Line> lines) {

    /** 包裹里的一行：订单行 + 本次发出的件数 */
    public record Line(UUID orderItemId, int quantity) {}

    /** 行 → 件数（交寄时入账、取消时回退共用同一张表）；同单重复行由 DTO 与唯一索引挡掉 */
    public Map<UUID, Integer> quantityByItem() {
        return lines.stream().collect(Collectors.toMap(Line::orderItemId, Line::quantity));
    }
}
