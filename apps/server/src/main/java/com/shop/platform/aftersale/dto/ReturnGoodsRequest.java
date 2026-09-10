package com.shop.platform.aftersale.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 买家回寄退货入参：快递公司 + 运单号（仅退货退款路径，处于 RETURNING 时可填）。
 *
 * <p>{@code carrierCode} 可空：买家回寄是线下行为，他可能只知道"顺丰"这个名字。
 * 有 code 时按字典归一（与卖家发货一致），没有时按名字匹配字典、匹配不上就原样记进包裹。
 */
public record ReturnGoodsRequest(
        @Size(max = 32) String carrierCode,
        @NotBlank(message = "快递公司不能为空") @Size(max = 50) String logisticsCompany,
        @NotBlank @Size(max = 64) String trackingNo) {}
