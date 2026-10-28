package com.shop.platform.inventory.api;

import java.util.List;
import java.util.UUID;

/**
 * 一次退货入库：这个售后单退回的货回到仓里。
 *
 * <p>{@code rmaCaseId} 是幂等锚点：售后单签收退货那一刻调一次，重放同一次签收不重复入库。
 *
 * <p>只有「货真的回来了」才调这里。仅退款（不需要寄回）不入库——那批货从没离开过商家。
 *
 * @param lines 退回的 SKU 与件数
 */
public record RestockRequest(UUID rmaCaseId, UUID merchantId, List<Line> lines) {

    public RestockRequest {
        lines = List.copyOf(lines);
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("回补至少要有一行");
        }
    }

    /** @param lineNo 售后单内的行序号，只用于流水幂等键 */
    public record Line(UUID skuId, int lineNo, int quantity) {

        public Line {
            if (quantity <= 0) {
                throw new IllegalArgumentException("回补数量必须为正: " + quantity);
            }
        }
    }
}
