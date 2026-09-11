package com.shop.platform.shop.api;

import com.shop.platform.common.Money;
import java.util.UUID;

/**
 * 运费报价（{@code ShippingFeeReadQuery} 的出参）——order 结算拿它填订单的运费与计费快照列。
 *
 * <p>{@code deliverable} 与 {@code shippingFee} 是<b>两个问题</b>，不能合成一个「运费极大」的哨兵值：
 * 不配送地区是「送不到」（下单直接拒绝），偏远地区加价是「送得到但贵」，混在一起会让 order 猜原因。
 *
 * <p>{@code templateId} 为 null = 该店没配模板，语义是恒包邮（模板是上线后新增的能力，
 * 老店铺没配模板时若拒绝下单等于把历史店铺全部锁死），此时订单上这一列也为 null。
 */
public record ShippingQuote(UUID templateId, boolean deliverable, Money shippingFee) {}
