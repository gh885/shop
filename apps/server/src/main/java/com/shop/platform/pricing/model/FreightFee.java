package com.shop.platform.pricing.model;

import com.shop.platform.seller.api.FreightRule;
import java.util.Comparator;
import java.util.Optional;

/**
 * 运费金额的计算。**规则数据在 {@code seller}，算钱在这里**——因为门槛要看折后金额，
 * 而折后金额只有算价知道。
 *
 * <p>和 {@link Allocation} 是同一个位置：纯函数、无状态、不碰库，同输入同输出。
 */
public final class FreightFee {

    private FreightFee() {}

    /**
     * 按 (地区, 计费量) 算运费。
     *
     * <p>三条运行期规则：
     *
     * <ol>
     *   <li>地区匹配取最具体的：按 {@code areaCodes} 的层级深度降序，第一条命中的生效
     *   <li>都没命中用默认项（{@code areaCodes: []}）
     *   <li>首件（重）价 + 超出部分按续件（重）价，续重向上取整
     * </ol>
     *
     * @param districtCode 收货地址的区县码，可空；空则直接用默认项
     * @param amount 计费量：按重量是克，按件是件数
     */
    public static long feeFor(FreightRule rule, String districtCode, long amount) {
        FreightRule.Region matched = match(rule, districtCode);
        if (matched == null) {
            // 库约束 ck_shipping_default_region 已经拦住这种模板，走到这里是数据被绕过 API 改过
            throw new IllegalStateException("运费模板缺少默认地区项: " + rule.templateId());
        }
        if (amount <= matched.first()) {
            return matched.firstFee();
        }
        long extra = amount - matched.first();
        long steps = (extra + matched.additional() - 1) / matched.additional();
        return matched.firstFee() + steps * matched.additionalFee();
    }

    private static FreightRule.Region match(FreightRule rule, String districtCode) {
        if (districtCode != null) {
            Optional<FreightRule.Region> specific = rule.regions().stream()
                    .filter(region -> !region.isDefault())
                    .filter(region -> region.areaCodes().contains(districtCode))
                    .max(Comparator.comparingInt(
                            region -> depth(region.areaCodes().getFirst())));
            if (specific.isPresent()) {
                return specific.get();
            }
        }
        return rule.regions().stream()
                .filter(FreightRule.Region::isDefault)
                .findFirst()
                .orElse(null);
    }

    /** 行政区划编码按 2 位一段：省 2 / 市 4 / 区 6。层级深度就是它的具体程度。 */
    private static int depth(String code) {
        return code == null ? 0 : code.length();
    }
}
