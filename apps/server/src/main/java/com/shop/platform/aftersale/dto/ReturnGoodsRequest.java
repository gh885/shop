package com.shop.platform.aftersale.dto;

import com.shop.platform.common.TrackingFieldRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 买家回寄退货入参：快递公司 + 运单号（仅退货退款路径，处于 RETURNING 时可填）。
 *
 * <p>{@code carrierCode} 可空：买家回寄是线下行为，他可能只知道"顺丰"这个名字。
 * 有 code 时按字典归一（与卖家发货一致），没有时按名字匹配字典、匹配不上就原样记进包裹。
 *
 * <p>长度与卖家发货同一份词表（{@link TrackingFieldRules}）：两条路径最终写的是同一批列——归一后的名字进
 * {@code logistics.shipments.carrier_name VARCHAR(50)}，同时冗余投影进 {@code aftersale.refunds.return_carrier_name}
 * （V81 建表即 50，与包裹列同宽）。两处宽度与这里的门由 {@code FieldRuleVocabularyTest} 钉在一起。
 */
public record ReturnGoodsRequest(
        @Size(max = TrackingFieldRules.CARRIER_CODE_MAX) String carrierCode,
        @NotBlank(message = "快递公司不能为空") @Size(max = TrackingFieldRules.CARRIER_NAME_MAX) String logisticsCompany,
        @NotBlank @Size(max = TrackingFieldRules.TRACKING_NO_MAX) String trackingNo) {}
