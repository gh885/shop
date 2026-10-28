package com.shop.platform.catalog.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/**
 * 商家改库存的请求：这个商品下每个 SKU 现在有多少件、压多少安全库存。
 *
 * <p><b>全量覆盖，不是增量。</b> 与 {@code PUT /skus} 同一语义：请求里没给的 SKU 库存不动，
 * 给了的就是「改成这个数」。商家手里的操作天然是「打开一张 SKU 表格，把数字重填一遍」。
 *
 * <p>只有实物与安全库存两个入口可写，可售由守恒式反推——
 * 让调用方同时传可售，就有两个数对不上的可能。
 *
 * @param requestId 幂等键。批量改一次上千行，前端超时重试必须只落一遍账；同一个 id 重放是空操作
 * @param lines 要改的 SKU。空数组是合法请求（等于什么都不改），但不该发生——前端应该只在有改动时才发
 */
public record AdjustStockRequest(UUID requestId, List<Line> lines) {

    public AdjustStockRequest {
        lines = lines == null ? List.of() : List.copyOf(lines);
    }

    /**
     * @param onHand 仓里实际有多少件
     * @param safety 安全库存：商家自己压住的缓冲，压住可售。默认 0
     */
    @Schema(name = "AdjustStockLine")
    public record Line(UUID skuId, Integer onHand, Integer safety) {}
}
