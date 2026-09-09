package com.shop.platform.order.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;

/**
 * 结算预览入参：与 CreateOrderRequest 同构但地址可选——
 * addressId 缺省返回 null 地址块（前端持有地址列表自行默认勾选），结算行不可为空。
 */
public record PreviewOrderRequest(UUID addressId, @NotEmpty List<@Valid OrderLineRequest> lines) {}
