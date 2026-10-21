package com.shop.platform.pricing.api;

import com.shop.platform.common.money.Money;
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
     * <p>单价和商家不在这里传——算价自己去 catalog 取挂牌价。让调用方传价格，等于允许别处编价格。
     */
    public record Line(int lineNo, UUID offerId, UUID skuId, UUID merchantId, int quantity) {

        public Line {
            if (quantity <= 0) {
                throw new IllegalArgumentException("行数量必须为正: " + quantity);
            }
        }
    }

    /** 算价结果：报价单 id + 总额，明细从库里读。 */
    public record Quoted(UUID quoteId, Money goods, Money discount, Money shipping, Money payable) {}
}
