package com.shop.platform.seller.api;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.List;
import java.util.UUID;

/**
 * 一个店铺的运费规则，已展开成值对象。算价只认这个形状，不碰 {@code seller} 的表。
 *
 * <p><b>数据归这里，算钱不归这里。</b>和 {@code promotion} 的 {@code AppliedRule} 是同一个分工：
 * seller 说"这家店的运费怎么收"，pricing 结合折后金额算出"这一单收多少"。
 *
 * @param templateId 模板 id，落进 {@code price_quote_shipping} 作为证据
 * @param freeOver 满额包邮门槛，分。null = 不免邮
 * @param regions 地区费率表，必须含一条 {@code areaCodes} 为空的默认项
 */
public record FreightRule(UUID templateId, ChargeBy chargeBy, Long freeOver, List<Region> regions) {

    public FreightRule {
        if (chargeBy == null) {
            throw new IllegalArgumentException("运费模板必须给出计费口径: " + templateId);
        }
        regions = regions == null ? List.of() : List.copyOf(regions);
    }

    /** 按重量还是按件计费。库里存小写，按项目里统一的枚举约定。 */
    public enum ChargeBy {
        WEIGHT,
        PIECE;

        public String dbValue() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }
    }

    /**
     * 一条地区费率。
     *
     * @param areaCodes 地区编码；<b>空数组是默认项</b>，所有具体地区都没命中时用它
     * @param first 首件（首重）的数量或重量
     * @param additional 续件（续重）的单位数量或重量
     */
    public record Region(List<String> areaCodes, long first, long firstFee, long additional, long additionalFee) {

        public Region {
            areaCodes = areaCodes == null ? List.of() : List.copyOf(areaCodes);
            // 这几条不是"输入校验"，是这个形状本身的定义：续件为 0 会让算价除零，
            // 首件为 0 会让"超出部分"把首件价吃掉，负数运费是白送钱。
            // 放在值对象里，读库和接请求走的是同一道闸。
            if (first < 1) {
                throw new IllegalArgumentException("首件（重）必须 >= 1: " + first);
            }
            if (additional < 1) {
                throw new IllegalArgumentException("续件（重）必须 >= 1: " + additional);
            }
            if (firstFee < 0 || additionalFee < 0) {
                throw new IllegalArgumentException("运费不能为负: " + firstFee + " / " + additionalFee);
            }
            if (areaCodes.stream().anyMatch(code -> code == null || code.isBlank())) {
                throw new IllegalArgumentException("地区编码不能是空串");
            }
        }

        /** 派生字段，不进 JSON：它是 {@code areaCodes.isEmpty()} 的另一种写法，传出去只会让客户端以为有第二个开关。 */
        @JsonIgnore
        public boolean isDefault() {
            return areaCodes.isEmpty();
        }
    }
}
