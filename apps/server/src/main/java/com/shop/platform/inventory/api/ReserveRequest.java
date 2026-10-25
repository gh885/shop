package com.shop.platform.inventory.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 一次下单要锁的货。
 *
 * <p>{@code lineNo} 是 {@code seller_order} 内的行号，不是订单组的：一个订单组有两个商家时，
 * 两边都有第 1 行，用组号做幂等键会撞。见 {@code docs/domain/inventory.md} §3。
 *
 * @param expiresAt 订单的 {@code expires_at}。预占过期时间由库存自己加 10 分钟宽限，调用方不要预先加
 */
public record ReserveRequest(UUID orderGroupId, UUID sellerOrderId, List<Line> lines, Instant expiresAt) {

    public ReserveRequest {
        lines = List.copyOf(lines);
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("预占至少要有一行");
        }
    }

    public record Line(UUID skuId, UUID merchantId, int lineNo, int quantity) {

        public Line {
            if (quantity <= 0) {
                throw new IllegalArgumentException("预占数量必须为正: " + quantity);
            }
        }
    }
}
