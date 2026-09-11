package com.shop.platform.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.service.OrderService;
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
 * 运费计费端到端集成验证（真库）：店铺配的运费模板经 shop :: api 走完「结算预览 → 下单落库」全链路。
 *
 * <p>为什么必须真库：这条链路上有三处只有真库才成立的东西——模板四张表的装配（含可空的包邮门槛）、
 * 订单的金额 CHECK（pay_amount = item_amount + shipping_fee，算错直接插不进去）、
 * 以及计费快照列落库。mock 掉 shop 侧后整条链路都是假的。
 *
 * <p>收货地区分别取深圳（命中指定地区规则）、喀什（不配送）、北京（回落默认规则）。
 */
@SpringBootTest
class ShippingFeeIT extends IntegrationTestSupport {

    @Autowired
    private OrderService orderService;

    @Autowired
    private ShippingTemplateService shippingTemplateService;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    /**
     * 建模板并登记清理：默认 首件 1 件 10 元 / 续件 1 件 5 元；广东(44) 首件 1 件 20 元 / 续件 1 件 8 元；
     * 新疆(65) 不配送。
     *
     * <p>登记顺序 = 插入顺序（模板 → 规则 → 区域 → 不配送），purge 逆序删除天然先子后父。
     */
    private UUID seedTemplate(Integer freeOverQuantity) {
        ShippingPricing saved = shippingTemplateService.save(
                shopId,
                new ShippingTemplateRequest(
                        false,
                        freeOverQuantity,
                        null,
                        new ShippingFeeTier(1, 1000L, 1, 500L),
                        List.of(new RegionalRule(List.of("44"), 1, 2000L, 1, 800L)),
                        List.of("65")));
        UUID templateId = saved.template().getId();
        db.onDelete("DELETE FROM shop.shipping_templates WHERE id = ?::uuid", templateId.toString());
        db.onDelete("DELETE FROM shop.shipping_rules WHERE template_id = ?::uuid", templateId.toString());
        db.onDelete(
                "DELETE FROM shop.shipping_rule_regions WHERE rule_id IN (SELECT id FROM shop.shipping_rules WHERE template_id = ?::uuid)",
                templateId.toString());
        db.onDelete("DELETE FROM shop.shipping_exclusions WHERE template_id = ?::uuid", templateId.toString());
        return templateId;
    }

    /** 下单链路的数据登记（订单/行项/事件登记表），与 OrderFlowIT 同款兜底圈删 */
    private void registerOrderCleanup() {
        db.onDelete(
                "DELETE FROM orders.items WHERE order_id IN (SELECT id FROM orders.orders WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete("DELETE FROM orders.orders WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM kernel.event_publication WHERE serialized_event LIKE ?", "%" + userId + "%");
    }

    private CreateOrderRequest createRequest(UUID addressId, UUID skuId, int quantity) {
        return new CreateOrderRequest(
                UUID.randomUUID(), addressId, List.of(new OrderLineRequest(skuId, quantity)), null);
    }

    @Test
    void 广东地址_按指定地区规则计费_下单落运费与模板快照() {
        UUID templateId = seedTemplate(null);
        UUID skuId = db.seedOnSaleSku(shopId, 1000L, 9);
        UUID addressId = db.seedAddress(userId, "440305", "广东省", "深圳市", "南山区");
        registerOrderCleanup();

        var preview = orderService.preview(
                userId, new PreviewOrderRequest(addressId, List.of(new OrderLineRequest(skuId, 2))));

        // 深圳命中 44 规则：首件 1 件 2000 分 + 续 1 件 800 分；商品额 1000×2
        var group = preview.groups().getFirst();
        assertThat(group.itemAmount()).isEqualTo(Money.cny(2000));
        assertThat(group.shippingFee()).isEqualTo(Money.cny(2800));
        assertThat(group.payAmount()).isEqualTo(Money.cny(4800));
        assertThat(group.deliverable()).isTrue();
        assertThat(group.shippingTemplateId()).isEqualTo(templateId);
        assertThat(preview.totalPayAmount()).isEqualTo(Money.cny(4800));

        List<Order> orders = orderService.create(userId, createRequest(addressId, skuId, 2));

        Order order = orders.getFirst();
        assertThat(order.getShippingFee()).isEqualTo(2800L);
        assertThat(order.getPayAmount()).isEqualTo(4800L);
        assertThat(order.getShippingTemplateId()).isEqualTo(templateId);
        assertThat(order.getReceiverRegionCode()).isEqualTo("440305");
        // DB 的 CHECK 是最后一道闸：金额口径一旦与商品额+运费不符，这里插不进去（真库才验得到）
        assertThat(jdbc.queryForObject(
                        "SELECT pay_amount - item_amount - shipping_fee FROM orders.orders WHERE id = ?::uuid",
                        Long.class,
                        order.getId().toString()))
                .isZero();
    }

    @Test
    void 北京地址_无地区规则命中_回落默认规则() {
        seedTemplate(null);
        UUID skuId = db.seedOnSaleSku(shopId, 1000L, 9);
        UUID addressId = db.seedAddress(userId, "110105", "北京市", "北京市", "朝阳区");
        registerOrderCleanup();

        var preview = orderService.preview(
                userId, new PreviewOrderRequest(addressId, List.of(new OrderLineRequest(skuId, 3))));

        // 默认规则：首件 1 件 1000 分 + 续 1 件 500 分 × 2 档（不足一档按一档）
        assertThat(preview.groups().getFirst().shippingFee()).isEqualTo(Money.cny(2000));
        assertThat(preview.groups().getFirst().payAmount()).isEqualTo(Money.cny(5000));
    }

    @Test
    void 不配送地区_预览标记不可达_下单直接拒绝且不落单() {
        seedTemplate(null);
        UUID skuId = db.seedOnSaleSku(shopId, 1000L, 9);
        UUID addressId = db.seedAddress(userId, "653101", "新疆维吾尔自治区", "喀什地区", "喀什市");
        registerOrderCleanup();

        var preview = orderService.preview(
                userId, new PreviewOrderRequest(addressId, List.of(new OrderLineRequest(skuId, 1))));

        assertThat(preview.groups().getFirst().deliverable()).isFalse();
        assertThat(preview.groups().getFirst().shippingFee()).isEqualTo(Money.cny(0));

        // 预览只提示，闸门在下单：脚本绕过界面直接下单也必须被拒
        assertThatThrownBy(() -> orderService.create(userId, createRequest(addressId, skuId, 1)))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(400);
                    assertThat(ex.getDetail()).contains("不支持配送");
                });
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM orders.orders WHERE user_id = ?::uuid", Integer.class, userId.toString()))
                .isZero();
    }

    @Test
    void 满件包邮_达到门槛运费归零() {
        seedTemplate(3);
        UUID skuId = db.seedOnSaleSku(shopId, 1000L, 9);
        UUID addressId = db.seedAddress(userId, "440305", "广东省", "深圳市", "南山区");
        registerOrderCleanup();

        var reached = orderService.preview(
                userId, new PreviewOrderRequest(addressId, List.of(new OrderLineRequest(skuId, 3))));
        assertThat(reached.groups().getFirst().shippingFee()).isEqualTo(Money.cny(0));
        assertThat(reached.groups().getFirst().payAmount()).isEqualTo(Money.cny(3000));

        var belowThreshold = orderService.preview(
                userId, new PreviewOrderRequest(addressId, List.of(new OrderLineRequest(skuId, 2))));
        assertThat(belowThreshold.groups().getFirst().shippingFee()).isEqualTo(Money.cny(2800));
    }

    @Test
    void 未配运费模板_恒包邮且无模板快照() {
        UUID bareShop = UUID.randomUUID();
        UUID skuId = db.seedOnSaleSku(bareShop, 1500L, 5);
        UUID addressId = db.seedAddress(userId, "440305", "广东省", "深圳市", "南山区");
        registerOrderCleanup();

        List<Order> orders = orderService.create(userId, createRequest(addressId, skuId, 2));

        Order order = orders.getFirst();
        assertThat(order.getShippingFee()).isZero();
        assertThat(order.getPayAmount()).isEqualTo(3000L);
        assertThat(order.getShippingTemplateId()).isNull();
    }
}
