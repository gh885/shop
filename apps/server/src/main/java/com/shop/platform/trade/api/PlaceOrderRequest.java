package com.shop.platform.trade.api;

import java.util.List;
import java.util.UUID;

/**
 * 落单命令的输入。
 *
 * <p>只带 {@code quoteId}、{@code addressId} 和 {@code lines}：金额一律从报价单读，地址一律从
 * 地址簿按 id 取快照，调用方不许传这两样的内容——传内容等于允许别处编价格、编收货信息。
 *
 * @param quoteId 报价单 id。pricing 校验它 issued、未过期、fingerprint 与当前购物车一致
 * @param addressId 收货地址 id。trade 经 account::api 点查校验归属本人，再展开成完整快照落进订单
 */
public record PlaceOrderRequest(UUID buyerId, UUID quoteId, UUID addressId, List<Line> lines, String idempotencyKey) {

    public PlaceOrderRequest {
        lines = List.copyOf(lines);
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("下单至少要有一行");
        }
    }

    /**
     * 一行。[{@code lineNo} 沿用报价单行号]，重编号会让 {@code order_line_discount} 对不上行。
     *
     * <p><b>商家和店铺不在必填项里。</b> 两者都由 catalog 的 offer 决定，买家填不出来也不该填。
     * 它们在这里只是可选校验位：给了就必须与报价单一致，用来挡住"下单时商品已经被换商家挂售"。
     * 真正的归属一律以报价单快照为准。
     */
    public record Line(int lineNo, UUID skuId, UUID offerId, UUID merchantId, UUID shopId, int quantity) {

        public Line {
            if (quantity <= 0) {
                throw new IllegalArgumentException("行数量必须为正: " + quantity);
            }
        }

        /** 买家侧用的构造：只有行号、SKU、数量和可选的 offer 校验位。 */
        public static Line of(int lineNo, UUID skuId, UUID offerId, int quantity) {
            return new Line(lineNo, skuId, offerId, null, null, quantity);
        }
    }
}
