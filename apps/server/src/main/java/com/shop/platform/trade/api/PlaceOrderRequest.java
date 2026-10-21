package com.shop.platform.trade.api;

import java.util.List;
import java.util.UUID;

/**
 * 落单命令的输入。
 *
 * <p>只带 {@code quoteId} 和 {@code lines}：金额一律从报价单读，调用方不许传价格。
 * 让调用方传金额，等于给"落单价比试算贵"开了一扇门。
 *
 * @param quoteId 报价单 id。pricing 校验它 issued、未过期、fingerprint 与当前购物车一致
 */
public record PlaceOrderRequest(
        UUID buyerId, UUID quoteId, Address shipAddress, List<Line> lines, String idempotencyKey) {

    public PlaceOrderRequest {
        lines = List.copyOf(lines);
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("下单至少要有一行");
        }
    }

    /**
     * 收货地址快照。**必须完整可发**——快照里存脱敏电话，商家就发不了货。
     */
    public record Address(
            String receiverName,
            String phone,
            String provinceCode,
            String cityCode,
            String districtCode,
            String detail) {}

    /**
     * 一行。[{@code lineNo} 沿用报价单行号]，重编号会让 {@code order_line_discount} 对不上。
     */
    public record Line(int lineNo, UUID skuId, UUID offerId, UUID merchantId, UUID shopId, int quantity) {

        public Line {
            if (quantity <= 0) {
                throw new IllegalArgumentException("行数量必须为正: " + quantity);
            }
        }
    }
}
