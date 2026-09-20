package com.shop.platform.shop;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.Money;
import com.shop.platform.shop.api.ShippingQuote;
import com.shop.platform.shop.mapper.ShippingRule;
import com.shop.platform.shop.mapper.ShippingTemplate;
import com.shop.platform.shop.service.ShippingFeeCalculator;
import com.shop.platform.shop.service.ShippingPricing;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 运费计费器单测（纯函数，无 DB）：规则选择、包邮条件、不配送优先级、首件/续件的取档边界。
 *
 * <p>这里是「算错钱」的集中防线：一口价规则、跨档、不设包邮条件、地区粒度覆盖——
 * 一个反了的布尔或漏掉的兜底都会让买家少付/多付，且很难在界面上看出来。
 */
class ShippingFeeCalculatorTest {

    private final ShippingFeeCalculator calculator = new ShippingFeeCalculator();

    private final UUID templateId = UUID.randomUUID();

    private final UUID defaultRuleId = UUID.randomUUID();

    /** 默认规则：首件 1 件 10 元，续件每 1 件 5 元 */
    private ShippingRule defaultRule() {
        return rule(defaultRuleId, true, 1, 1000L, 1, 500L);
    }

    private static ShippingRule rule(
            UUID id, boolean isDefault, int firstQuantity, long firstFee, int addQuantity, long addFee) {
        return ShippingRule.builder()
                .id(id)
                .isDefault(isDefault)
                .firstQuantity(firstQuantity)
                .firstFee(firstFee)
                .addQuantity(addQuantity)
                .addFee(addFee)
                .currency(Money.CNY)
                .build();
    }

    private ShippingPricing pricing(List<ShippingPricing.RegionRule> regionRules, List<String> excluded) {
        return new ShippingPricing(template(false, null, null), defaultRule(), regionRules, excluded);
    }

    private ShippingTemplate template(Boolean freeShipping, Integer freeOverQuantity, Long freeOverAmount) {
        return ShippingTemplate.builder()
                .id(templateId)
                .freeShipping(freeShipping)
                .freeOverQuantity(freeOverQuantity)
                .freeOverAmount(freeOverAmount)
                .currency(Money.CNY)
                .build();
    }

    private ShippingPricing.RegionRule regionRule(String... prefixes) {
        return regionRule(2000L, 800L, prefixes);
    }

    private ShippingPricing.RegionRule regionRule(long firstFee, long addFee, String... prefixes) {
        return new ShippingPricing.RegionRule(
                rule(UUID.randomUUID(), false, 1, firstFee, 1, addFee), List.of(prefixes));
    }

    // ---- 默认规则：没有地区规则命中时的兜底 ----

    @Test
    void 无地区规则命中_用默认规则且只收首费() {
        ShippingQuote quote = calculator.quote(pricing(List.of(), List.of()), "110105", 1, Money.cny(9999));

        assertThat(quote.deliverable()).isTrue();
        assertThat(quote.templateId()).isEqualTo(templateId);
        assertThat(quote.shippingFee()).isEqualTo(Money.cny(1000));
    }

    @Test
    void 超出首件_不足一续档按一档计() {
        // 首件 1 件 + 续件每 1 件：3 件 = 1000 + 2×500
        assertThat(calculator
                        .quote(pricing(List.of(), List.of()), "110105", 3, Money.cny(1))
                        .shippingFee())
                .isEqualTo(Money.cny(2000));
    }

    @Test
    void 续件标准为三件_超出两件也只算一档() {
        ShippingPricing pricing = new ShippingPricing(
                template(false, null, null), rule(defaultRuleId, true, 1, 1000L, 3, 500L), List.of(), List.of());

        // 3 件 = 首件 1 + 超出 2 件（不足 3 件续档）→ 仍按一档 500
        assertThat(calculator.quote(pricing, "110105", 3, Money.cny(1)).shippingFee())
                .isEqualTo(Money.cny(1500));
        // 4 件 = 首件 1 + 超出 3 件 → 满一档
        assertThat(calculator.quote(pricing, "110105", 4, Money.cny(1)).shippingFee())
                .isEqualTo(Money.cny(1500));
        // 7 件 = 首件 1 + 超出 6 件 → 两档
        assertThat(calculator.quote(pricing, "110105", 7, Money.cny(1)).shippingFee())
                .isEqualTo(Money.cny(2000));
    }

    // ---- 指定地区：最长前缀胜（更具体的粒度优先） ----

    @Test
    void 省级与市级规则同时命中_取更具体的市级() {
        // 省规则 1500 / 市规则 2500：费用故意不同，才能看出到底选了哪条（同价时这条测试是假的）
        ShippingPricing pricing =
                pricing(List.of(regionRule(1500L, 300L, "44"), regionRule(2500L, 900L, "4403")), List.of());

        // 深圳市南山区 440305：44 与 4403 都命中，4403 更长
        assertThat(calculator.quote(pricing, "440305", 1, Money.cny(1)).shippingFee())
                .isEqualTo(Money.cny(2500));
        // 广东其他城市 4401xx：只剩 44 命中
        assertThat(calculator.quote(pricing, "440106", 1, Money.cny(1)).shippingFee())
                .isEqualTo(Money.cny(1500));
    }

    @Test
    void 指定地区规则命中_不使用默认规则的费用() {
        ShippingPricing pricing = new ShippingPricing(
                template(false, null, null),
                defaultRule(), // 默认 1000
                List.of(regionRule("4403")), // 深圳 2000
                List.of());

        assertThat(calculator.quote(pricing, "440305", 2, Money.cny(1)).shippingFee())
                .isEqualTo(Money.cny(2800)); // 2000 + 800
        assertThat(calculator.quote(pricing, "330106", 2, Money.cny(1)).shippingFee())
                .isEqualTo(Money.cny(1500)); // 默认 1000 + 500
    }

    // ---- 不配送：优先于一切，连包邮条件也救不回来 ----

    @Test
    void 命中不配送地区_不可达且不看运费() {
        ShippingPricing pricing = new ShippingPricing(
                template(true, null, null), // 即使整店包邮也不配送
                defaultRule(),
                List.of(regionRule("4403")),
                List.of("6531")); // 喀什地区

        ShippingQuote quote = calculator.quote(pricing, "653101", 1, Money.cny(9999));

        assertThat(quote.deliverable()).isFalse();
        assertThat(quote.shippingFee()).isEqualTo(Money.cny(0));
    }

    @Test
    void 更细粒度不配送_只挡该市不挡全省() {
        ShippingPricing pricing = pricing(List.of(regionRule("44")), List.of("4403"));

        assertThat(calculator.quote(pricing, "440305", 1, Money.cny(1)).deliverable())
                .isFalse();
        assertThat(calculator.quote(pricing, "440106", 1, Money.cny(1)).deliverable())
                .isTrue();
    }

    // ---- 模板级包邮：整店包邮 / 满件 / 满额 ----

    @Test
    void 整店包邮_任何地区任何件数都零运费() {
        ShippingPricing pricing =
                new ShippingPricing(template(true, null, null), defaultRule(), List.of(regionRule("4403")), List.of());

        assertThat(calculator.quote(pricing, "440305", 9, Money.cny(100)).shippingFee())
                .isEqualTo(Money.cny(0));
    }

    @Test
    void 满件包邮_达到门槛归零_差一件照收() {
        ShippingPricing pricing = new ShippingPricing(template(false, 3, null), defaultRule(), List.of(), List.of());

        assertThat(calculator.quote(pricing, "110105", 3, Money.cny(100)).shippingFee())
                .isEqualTo(Money.cny(0));
        assertThat(calculator.quote(pricing, "110105", 2, Money.cny(100)).shippingFee())
                .isEqualTo(Money.cny(1500));
    }

    @Test
    void 满额包邮_基数是商品额不是应付额() {
        ShippingPricing pricing =
                new ShippingPricing(template(false, null, 10000L), defaultRule(), List.of(), List.of());

        // 商品额 10000 分正好达门槛：免运费（若拿「商品额+运费」判，运费就永远算不出来了）
        assertThat(calculator.quote(pricing, "110105", 1, Money.cny(10000)).shippingFee())
                .isEqualTo(Money.cny(0));
        assertThat(calculator.quote(pricing, "110105", 1, Money.cny(9999)).shippingFee())
                .isEqualTo(Money.cny(1000));
    }
}
