package com.shop.platform.logistics.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 老发货入参（自由文本物流公司）—— <b>过渡兼容层，将由 {@link CreateShipmentRequest} 取代</b>。
 *
 * <p>保留原因：卖家工作台当前还调 {@code PUT /seller/orders/{id}/ship} 并发这个 body，
 * 后端先归一时不能把在用的功能打断。删除条件 = 前端切到 {@code POST /seller/shipments}。
 * 落库时物流公司名会尝试回查承运商字典归一，匹配不上就原样记录（{@code carrier_code} 留空）。
 */
public record ShipOrderRequest(
        @NotBlank(message = "物流公司不能为空") @Size(max = 50) String logisticsCompany,
        @NotBlank(message = "运单号不能为空") @Size(max = 64) String trackingNo) {}
