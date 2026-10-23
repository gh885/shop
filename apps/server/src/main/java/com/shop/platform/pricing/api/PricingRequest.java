package com.shop.platform.pricing.api;

import java.util.List;
import java.util.UUID;

/**
 * 一次算价的输入。
 *
 * <p>{@code lines} 的顺序由调用方定，但 {@code lineNo} 必须由调用方给且唯一——它是分摊的并列键，
 * 也是 {@code price_quote_line} 的主键之一。算价不替调用方编行号。
 *
 * @param entitlements 券 / 会员等级等资格快照，原样落库作为证据。引擎不区分来源
 */
public record PricingRequest(UUID buyerId, Address address, List<Line> lines, List<Entitlement> entitlements) {

    public PricingRequest {
        lines = List.copyOf(lines);
        entitlements = entitlements == null ? List.of() : List.copyOf(entitlements);
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("算价至少要有一行");
        }
    }

    /**
     * @param provinceCode 省市区编码，运费模板按它匹配；不传详细地址，算价不需要门牌号
     */
    public record Address(String provinceCode, String cityCode, String districtCode) {}

    public record Entitlement(String kind, UUID refId) {}

    /**
     * 一行：[{@code skuId} + {@code quantity}]。
     *
     * <p><b>单价和商家都不在这里传</b>——两者都由 catalog 的 offer 决定，算价自己去取。
     * 让调用方传价格，等于允许别处编价格；让调用方传商家，等于允许把别人的货算进自己的单。
     *
     * <p>{@code offerId} / {@code merchantId} 是可选的**校验位**：给了就必须与 catalog 一致，
     * 用来挡住"用户看到的商品已经被换商家挂售"这种情况。不给也能算。
     */
    public record Line(int lineNo, UUID offerId, UUID skuId, UUID merchantId, int quantity) {

        public Line {
            if (quantity <= 0) {
                throw new IllegalArgumentException("行数量必须为正");
            }
        }

        /** 只带必填项的那一种构造：买家侧算价用这个。 */
        public static Line of(int lineNo, UUID skuId, int quantity) {
            return new Line(lineNo, null, skuId, null, quantity);
        }
    }
}
