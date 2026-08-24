package com.shop.platform.order.dto;

import java.util.List;
import java.util.UUID;

/**
 * 结算预览入参：与 CreateOrderRequest 同构但全部可选——
 * addressId 缺省返回 null 地址块（前端持有地址列表自行默认勾选），条目来源仍需二选一。
 */
public record PreviewOrderRequest(UUID addressId, List<UUID> cartItemIds, UUID buySkuId, Integer buyQuantity) {}
