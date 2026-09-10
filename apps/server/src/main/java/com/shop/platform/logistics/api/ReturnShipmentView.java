package com.shop.platform.logistics.api;

import java.util.UUID;

/**
 * 退货回寄包裹视图（命令返回值）：调用方（aftersale）拿它写自己的投影列与时间线。
 *
 * <p>承运商名给的是<b>归一后的字典名</b>而不是买家填的原文——同一家顺丰不该有两种写法，
 * 售后台账展示与物流详情必须一致。
 */
public record ReturnShipmentView(UUID shipmentId, String carrierCode, String carrierName, String trackingNo) {}
