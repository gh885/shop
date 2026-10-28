package com.shop.platform.inventory.api;

import java.util.List;
import java.util.UUID;

/**
 * 一次商家调整：把这个商家这批 SKU 的实物与安全库存改成给定的数。
 *
 * <p>{@code requestId} 是幂等键：批量调整一次几百上千行，前端超时重试必须只落一遍账。
 * 用服务端新生成的 id 当键只防「同一个对象重放」，挡不住重试——那是一次新请求，新 id。
 *
 * <p>为什么是「覆盖实物 + 安全」而不是「给一个增量」：商家手里的事实是「仓里到底有多少件」，
 * 不是「比上次多了几件」。增量语义下他得先知道上次填的是多少，而那个数正是他要去数的。
 *
 * @param lines 单个 SKU 的调整。{@code lineNo} 只是流水幂等键的分母，用请求内的序号即可
 */
public record AdjustRequest(UUID requestId, UUID merchantId, List<Line> lines) {

    public AdjustRequest {
        lines = List.copyOf(lines);
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("调整至少要有一行");
        }
    }

    /**
     * @param onHand 仓库里实际有多少件；可售由 {@code on_hand - reserved - safety} 反推
     * @param safety 商家按 SKU 配的缓冲，压住可售。默认 0
     */
    public record Line(UUID skuId, int lineNo, int onHand, int safety) {}
}
