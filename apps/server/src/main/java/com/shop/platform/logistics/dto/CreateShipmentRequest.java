package com.shop.platform.logistics.dto;

import com.shop.platform.common.TrackingFieldRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * 发货入参（卖家）：选字典里的快递公司 + 填运单号。
 *
 * <p>承运商只能是字典 code，不收自由文本——同一家顺丰五种写法既没法统计也没法对接物流商接口。
 * 展示名由后端按 code 查字典归一（{@code CarrierResolver}），前端不传名字。
 */
public record CreateShipmentRequest(
        @NotNull(message = "订单不能为空") UUID orderId,
        @NotBlank(message = "请选择快递公司") @Size(max = TrackingFieldRules.CARRIER_CODE_MAX) String carrierCode,
        @NotBlank(message = "运单号不能为空") @Size(max = TrackingFieldRules.TRACKING_NO_MAX) String trackingNo) {}
