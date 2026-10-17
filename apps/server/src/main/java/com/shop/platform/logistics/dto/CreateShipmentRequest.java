package com.shop.platform.logistics.dto;

import com.shop.platform.common.Quantities;
import com.shop.platform.common.TrackingFieldRules;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 录单入参（卖家）：选字典里的快递公司 + 填运单号 + 指定这个包裹装了哪些订单行的多少件。
 *
 * <p>承运商只能是字典 code，不收自由文本——同一家顺丰五种写法既没法统计也没法对接物流商接口。
 * 展示名由后端按 code 查字典归一（{@code CarrierResolver}），前端不传名字。
 *
 * <p>行数上限与下单同一档（{@link Quantities#ORDER_LINES_MAX}）：一个包裹最多装一整单的行。
 * 件数上限同 {@link Quantities#LINE_QUANTITY_MAX}，真正的闸门是订单行账本（不能超发）。
 */
public record CreateShipmentRequest(
        @NotNull(message = "订单不能为空") UUID orderId,
        @NotBlank(message = "请选择快递公司") @Size(max = TrackingFieldRules.CARRIER_CODE_MAX) String carrierCode,
        @NotBlank(message = "运单号不能为空") @Size(max = TrackingFieldRules.TRACKING_NO_MAX) String trackingNo,
        @NotNull
                @Size(
                        min = 1,
                        max = Quantities.ORDER_LINES_MAX,
                        message = "一次发货需 1 到 " + Quantities.ORDER_LINES_MAX + " 行")
                List<@Valid Line> lines) {

    /** 包裹里的一行：订单行 + 本次发出的件数 */
    public record Line(
            @NotNull(message = "订单行不能为空") UUID orderItemId,
            @NotNull @Min(1) @Max(Quantities.LINE_QUANTITY_MAX) Integer quantity) {}
}
