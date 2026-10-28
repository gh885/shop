package com.shop.platform.inventory.api;

import java.util.List;
import java.util.UUID;

/**
 * 一次出库：一个包裹装了哪些行、各多少件。
 *
 * <p>{@code packageId} 是幂等锚点，不是 {@code sellerOrderId}——一个子单可以分多个包裹发，
 * 同一个行号会出库多次。用订单当锚点，第二个包裹就会被当成重复请求吞掉；
 * 用包裹当锚点，重放同一个包裹恰好是空操作。
 *
 * <p>{@code lineNo} 与 {@link ReserveRequest.Line#lineNo()} 同源：{@code order_line.line_no}，
 * 预占的幂等键是 {@code (sellerOrderId, lineNo)}。
 *
 * @param lines 这个包裹要出的行。数量可以小于预占量——分批发货时最后一包才把预占耗完
 */
public record ShipRequest(UUID sellerOrderId, UUID packageId, List<Line> lines) {

    public ShipRequest {
        lines = List.copyOf(lines);
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("出库至少要有一行");
        }
    }

    public record Line(int lineNo, int quantity) {

        public Line {
            if (quantity <= 0) {
                throw new IllegalArgumentException("出库数量必须为正: " + quantity);
            }
        }
    }
}
