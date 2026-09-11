package com.shop.platform.shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.shop.dto.ShippingTemplateRequest;
import com.shop.platform.shop.dto.ShippingTemplateRequest.RegionalRule;
import com.shop.platform.shop.dto.ShippingTemplateRequest.ShippingFeeTier;
import com.shop.platform.shop.service.ShippingPricing;
import com.shop.platform.shop.service.ShippingTemplateService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 运费模板管理集成验证（真库）：覆盖式保存的「整批重建」语义与入参校验。
 *
 * <p>真库才验得到的两件事：重复保存后旧规则/旧区域不得残留（覆盖式保存最容易在这里漏水），
 * 以及四张表装配出的计费口径与写入的一致。校验失败必须一行都不落（事务边界）。
 */
@SpringBootTest
class ShippingTemplateIT extends IntegrationTestSupport {

    @Autowired
    private ShippingTemplateService shippingTemplateService;

    private final UUID shopId = UUID.randomUUID();

    private static final ShippingFeeTier DEFAULT_TIER = new ShippingFeeTier(1, 1000L, 1, 500L);

    private static ShippingTemplateRequest request(
            Boolean freeShipping,
            Integer freeOverQuantity,
            List<RegionalRule> regionRules,
            List<String> excludedRegions) {
        return new ShippingTemplateRequest(
                freeShipping, freeOverQuantity, null, DEFAULT_TIER, regionRules, excludedRegions);
    }

    private static RegionalRule region(String[] prefixes, long firstFee, long addFee) {
        return new RegionalRule(List.of(prefixes), 1, firstFee, 1, addFee);
    }

    /** 保存并登记清理（登记顺序 = 插入顺序：模板 → 规则 → 区域 → 不配送，purge 逆序先子后父） */
    private UUID save(ShippingTemplateRequest req) {
        ShippingPricing saved = shippingTemplateService.save(shopId, req);
        UUID templateId = saved.template().getId();
        db.onDelete("DELETE FROM shop.shipping_templates WHERE id = ?::uuid", templateId.toString());
        db.onDelete("DELETE FROM shop.shipping_rules WHERE template_id = ?::uuid", templateId.toString());
        db.onDelete(
                "DELETE FROM shop.shipping_rule_regions WHERE rule_id IN (SELECT id FROM shop.shipping_rules WHERE template_id = ?::uuid)",
                templateId.toString());
        db.onDelete("DELETE FROM shop.shipping_exclusions WHERE template_id = ?::uuid", templateId.toString());
        return templateId;
    }

    private int ruleCount(UUID templateId) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM shop.shipping_rules WHERE template_id = ?::uuid",
                Integer.class,
                templateId.toString());
        assertThat(count).isNotNull();
        return count;
    }

    private List<String> regionPrefixesOf(UUID templateId) {
        return jdbc.queryForList(
                "SELECT region_prefix FROM shop.shipping_rule_regions WHERE rule_id IN "
                        + "(SELECT id FROM shop.shipping_rules WHERE template_id = ?::uuid) ORDER BY region_prefix",
                String.class,
                templateId.toString());
    }

    @Test
    void 首次保存_默认规则与地区规则一起落库_未设置时取模板给404() {
        assertThatThrownBy(() -> shippingTemplateService.require(shopId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(404));

        UUID templateId =
                save(request(false, null, List.of(region(new String[] {"44", "4403"}, 2000L, 800L)), List.of("65")));

        ShippingPricing pricing = shippingTemplateService.require(shopId);
        assertThat(pricing.template().getId()).isEqualTo(templateId);
        assertThat(pricing.defaultRule().getFirstFee()).isEqualTo(1000L);
        assertThat(pricing.regionRules()).hasSize(1);
        assertThat(pricing.regionRules().getFirst().regionPrefixes()).containsExactly("44", "4403");
        assertThat(pricing.excludedRegions()).containsExactly("65");
        // 默认规则 + 一条指定地区规则
        assertThat(ruleCount(templateId)).isEqualTo(2);
    }

    @Test
    void 覆盖式保存_旧规则与旧区域不残留_模板仍只有一份() {
        UUID templateId = save(request(false, null, List.of(region(new String[] {"44"}, 2000L, 800L)), List.of("65")));

        // 第二次保存换掉整份：地区规则删掉、不配送改成 65 与 63，默认费用也改
        shippingTemplateService.save(
                shopId,
                new ShippingTemplateRequest(
                        false, null, null, new ShippingFeeTier(2, 1200L, 2, 600L), List.of(), List.of("65", "63")));

        ShippingPricing pricing = shippingTemplateService.require(shopId);
        assertThat(pricing.template().getId()).isEqualTo(templateId); // 原地更新，不是新建一份
        assertThat(ruleCount(templateId)).isEqualTo(1); // 只剩默认规则
        assertThat(regionPrefixesOf(templateId)).isEmpty(); // 旧区域没留下悬挂行
        assertThat(pricing.defaultRule().getFirstQuantity()).isEqualTo(2);
        assertThat(pricing.excludedRegions()).containsExactlyInAnyOrder("65", "63");
        Integer templates = jdbc.queryForObject(
                "SELECT count(*) FROM shop.shipping_templates WHERE shop_id = ?::uuid",
                Integer.class,
                shopId.toString());
        assertThat(templates).isEqualTo(1);
    }

    @Test
    void 整店包邮_满件满额门槛落库前被抹掉() {
        UUID templateId = save(request(true, 3, List.of(), List.of()));

        // 包邮下门槛是死配置：入库即噪音，回读也必须是 null（数据不撒谎）
        assertThat(shippingTemplateService.require(shopId).template().getFreeOverQuantity())
                .isNull();
        Integer threshold = jdbc.queryForObject(
                "SELECT free_over_quantity FROM shop.shipping_templates WHERE id = ?::uuid",
                Integer.class,
                templateId.toString());
        assertThat(threshold).isNull();
    }

    @Test
    void 区域前缀非国标_400且一行都不落() {
        assertThatThrownBy(() -> shippingTemplateService.save(
                        shopId, request(false, null, List.of(region(new String[] {"9999"}, 2000L, 800L)), List.of())))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(400);
                    assertThat(ex.getDetail()).contains("行政区划前缀无效");
                });

        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM shop.shipping_templates WHERE shop_id = ?::uuid",
                        Integer.class,
                        shopId.toString()))
                .isZero();
    }

    @Test
    void 同一地区配两条计费规则_400() {
        assertThatThrownBy(() -> shippingTemplateService.save(
                        shopId,
                        request(
                                false,
                                null,
                                List.of(
                                        region(new String[] {"44"}, 2000L, 800L),
                                        region(new String[] {"44", "4403"}, 3000L, 900L)),
                                List.of())))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(400);
                    assertThat(ex.getDetail()).contains("只能配置一条运费规则");
                });
    }

    @Test
    void 计费地区同时设为不配送_400() {
        assertThatThrownBy(() -> shippingTemplateService.save(
                        shopId,
                        request(false, null, List.of(region(new String[] {"4403"}, 2000L, 800L)), List.of("4403"))))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(400);
                    assertThat(ex.getDetail()).contains("不能再设为不配送");
                });
    }

    @Test
    void 广东计费_深圳不配送是合法配置() {
        // 更细粒度覆盖更粗粒度是模板的价值所在（全省能送、个别市送不到），不该被上面那条校验误伤
        UUID templateId =
                save(request(false, null, List.of(region(new String[] {"44"}, 2000L, 800L)), List.of("4403")));

        ShippingPricing pricing = shippingTemplateService.require(shopId);
        assertThat(pricing.template().getId()).isEqualTo(templateId);
        assertThat(pricing.regionRules().getFirst().regionPrefixes()).containsExactly("44");
        assertThat(pricing.excludedRegions()).containsExactly("4403");
    }
}
