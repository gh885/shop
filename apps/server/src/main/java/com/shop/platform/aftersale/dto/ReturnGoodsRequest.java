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
 * <p>长度与卖家发货同一份词表（{@link TrackingFieldRules}）：两条路径最终写的是同一批列。这里有个坑值得写下来——
 * 归一后的名字除了进 {@code logistics.shipments.carrier_name VARCHAR(50)}，还会冗余投影一份进
 * {@code aftersale.tickets.return_logistics_company}，而后者建表时抄成了 {@code VARCHAR(32)}（V47 从 V28 的
 * 旧列照搬宽度）。于是 33~50 字的快递公司名能过本类的门、却在投影那一列撞 {@code value too long}，
 * 买家填个长名字换来一个 500。V66 把投影列加宽到 50 对齐，本类的门与两处列宽由
 * {@code FieldRuleVocabularyTest} 钉在一起，不再靠人记住第三处。
 */
public record ReturnGoodsRequest(
        @Size(max = TrackingFieldRules.CARRIER_CODE_MAX) String carrierCode,
        @NotBlank(message = "快递公司不能为空") @Size(max = TrackingFieldRules.CARRIER_NAME_MAX) String logisticsCompany,
        @NotBlank @Size(max = TrackingFieldRules.TRACKING_NO_MAX) String trackingNo) {}
