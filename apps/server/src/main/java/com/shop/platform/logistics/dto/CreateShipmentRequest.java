package com.shop.platform.logistics.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * 发货入参（卖家，主路径）：选字典里的快递公司 + 填运单号。
 *
 * <p>与老端点 {@link ShipOrderRequest} 的差别就是 {@code carrierCode} 替掉了自由文本的物流公司名
 * ——同一家顺丰五种写法，既没法统计也没法对接物流商。
 */
public record CreateShipmentRequest(
        @NotNull(message = "订单不能为空") UUID orderId,
        @NotBlank(message = "请选择快递公司") @Size(max = 32) String carrierCode,
        @NotBlank(message = "运单号不能为空") @Size(max = 64) String trackingNo) {}
