package com.shop.platform.order.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 创建订单入参：购物车结算（cartItemIds）与立即购买（buySkuId + buyQuantity）二选一，service 校验互斥。
 * addressId 必填——预览阶段可先不选地址，真正下单必须已确定收货信息。
 */
public record CreateOrderRequest(
        @NotNull UUID addressId,
        List<UUID> cartItemIds,
        UUID buySkuId,
        Integer buyQuantity,
        @Size(max = 200, message = "留言最多 200 字") String buyerMessage) {}
