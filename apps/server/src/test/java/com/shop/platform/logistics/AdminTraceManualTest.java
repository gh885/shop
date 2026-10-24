package com.shop.platform.logistics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.fulfillment.api.FulfillmentCommand;
import com.shop.platform.fulfillment.service.FulfillmentService;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.ForbiddenException;
import com.shop.platform.logistics.controller.AdminTraceController;
import com.shop.platform.logistics.controller.AdminTraceController.ManualTraceRequest;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.pricing.dto.QuoteResponse;
import com.shop.platform.pricing.service.PriceQuoteService;
import com.shop.platform.trade.api.PlaceOrderRequest;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.service.PaymentStarter;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 人工补录轨迹：不接真渠道也能把"发货 → 运输 → 签收 → 订单完成"整条流程跑通；
 * 接了之后它是推送丢失时的人工兜底。和推送口同等危险，权限点 + 平台员工两道闸门。
 */
@SpringBootTest
@ActiveProfiles("test")
class AdminTraceManualTest {

    private static final UUID WAREHOUSE = new UUID(0L, 0L);

    @Autowired
    private TradeCommand orders;

    @Autowired
    private PriceQuoteService quotes;

    @Autowired
    private AddressService addresses;

    @Autowired
    private PaymentStarter paymentStarter;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private FulfillmentService fulfillment;

    @Autowired
    private AdminTraceController controller;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void 补录推进整条流程_签收到订单完成() {
        Paid paid = placePaidOrder();
        UUID packageId = ship(paid);

        // 补录"运输中"：包裹推进，证据在 trace_event
        Authorizer.runAs(operator("staff", "LOGISTICS_MANAGE"), () -> assertThat(
                        controller.record(request(paid.trackingNo(), "in_transit", null)))
                .containsEntry("standardCode", "in_transit"));
        assertThat(packageStatus(packageId)).isEqualTo("in_transit");

        // 补录"已签收"：trace 来源签收，订单完成
        Authorizer.runAs(operator("staff", "LOGISTICS_MANAGE"), () -> assertThat(
                        controller.record(request(paid.trackingNo(), "delivered", null)))
                .containsEntry("standardCode", "delivered"));
        assertThat(packageStatus(packageId)).isEqualTo("delivered");
        assertThat(jdbc.queryForObject(
                        "SELECT delivered_source FROM fulfillment.package WHERE id = ?", String.class, packageId))
                .isEqualTo("trace");
        assertThat(jdbc.queryForObject(
                        "SELECT fulfillment_status FROM trade.seller_order WHERE id = ?",
                        String.class,
                        paid.sellerOrderId()))
                .isEqualTo("received");
        Integer completions = jdbc.queryForObject(
                "SELECT count(*) FROM trade.order_event WHERE order_id = ? AND to_value = 'completed'",
                Integer.class,
                paid.orderGroupId());
        assertThat(completions).isEqualTo(1);
    }

    @Test
    void 补录要平台员工加权限点_非法码当场拒() {
        Paid paid = placePaidOrder();
        ship(paid);

        // 没有身份上下文：拒
        assertThatThrownBy(() -> controller.record(request(paid.trackingNo(), "in_transit", null)))
                .isInstanceOf(ForbiddenException.class);

        // 卖家即使被错授了权限点，也不是平台员工：拒
        Authorizer.runAs(operator("seller", "LOGISTICS_MANAGE"), () -> assertThatThrownBy(
                        () -> controller.record(request(paid.trackingNo(), "in_transit", null)))
                .isInstanceOf(BusinessException.class));

        // 平台员工缺权限点：拒
        Authorizer.runAs(operator("staff", "LEDGER_VIEW"), () -> assertThatThrownBy(
                        () -> controller.record(request(paid.trackingNo(), "in_transit", null)))
                .isInstanceOf(ForbiddenException.class));

        // 非法标准码：400，附全部可选码
        Authorizer.runAs(operator("staff", "LOGISTICS_MANAGE"), () -> assertThatThrownBy(
                        () -> controller.record(request(paid.trackingNo(), "paid", null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getHttpStatus()).isEqualTo(400);
                    assertThat(e.getMessage()).contains("delivered");
                }));
    }

    @Test
    void 同码同时间补录两次_只生效一次() {
        Paid paid = placePaidOrder();
        UUID packageId = ship(paid);
        String at = Instant.now().toString();

        for (int i = 0; i < 2; i++) {
            Authorizer.runAs(
                    operator("staff", "LOGISTICS_MANAGE"),
                    () -> controller.record(request(paid.trackingNo(), "delivered", at)));
        }

        assertThat(traceCount(packageId)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                        "SELECT received_qty FROM trade.order_line WHERE seller_order_id = ?",
                        Integer.class,
                        paid.sellerOrderId()))
                .isEqualTo(1);
    }

    // —— 构造 ——

    private static ManualTraceRequest request(String trackingNo, String code, String occurredAt) {
        return new ManualTraceRequest("sf", trackingNo, code, "测试补录", occurredAt);
    }

    private static CurrentOperator operator(String type, String... permissions) {
        return new CurrentOperator(UUID.randomUUID(), type, null, Set.of(), Set.copyOf(List.of(permissions)));
    }

    private String packageStatus(UUID packageId) {
        return jdbc.queryForObject("SELECT status FROM fulfillment.package WHERE id = ?", String.class, packageId);
    }

    private int traceCount(UUID packageId) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM logistics.trace_event WHERE package_id = ?", Integer.class, packageId);
        return count == null ? 0 : count;
    }

    // —— 下单 / 支付 / 发货 ——

    private record Paid(UUID buyerId, UUID orderGroupId, UUID sellerOrderId, UUID merchantId, String trackingNo) {}

    private UUID ship(Paid paid) {
        FulfillmentCommand.ShippedPackage shipped = fulfillment.ship(new FulfillmentCommand.ShipRequest(
                paid.sellerOrderId(),
                paid.merchantId(),
                "sf",
                paid.trackingNo(),
                List.of(new FulfillmentCommand.ShipItem(1, 1))));
        return shipped.packageId();
    }

    private Paid placePaidOrder() {
        UUID buyer = UUID.randomUUID();
        AddressView address = addresses.create(buyer, addressRequest());
        Seed goods = seedSellable(1_500, 10);

        QuoteResponse quote = quotes.quote(new PricingRequest(
                buyer,
                new PricingRequest.Address("44", "4403", "440305"),
                List.of(PricingRequest.Line.of(1, goods.skuId(), 1)),
                List.of()));

        TradeCommand.PlacedOrder placed = orders.placeOrder(new PlaceOrderRequest(
                buyer,
                quote.quoteId(),
                address.id(),
                List.of(PlaceOrderRequest.Line.of(1, goods.skuId(), null, 1)),
                null));

        PaymentView view = paymentStarter.start(placed.orderGroupId(), buyer);
        paymentService.confirm(view.paymentId(), buyer);
        awaitPaid(placed.orderGroupId());

        UUID sellerOrderId = jdbc.queryForObject(
                "SELECT id FROM trade.seller_order WHERE group_id = ?", UUID.class, placed.orderGroupId());
        return new Paid(buyer, placed.orderGroupId(), sellerOrderId, goods.merchantId(), "SF" + Ids.newId());
    }

    private void awaitPaid(UUID orderGroupId) {
        for (int i = 0; i < 100; i++) {
            String status = jdbc.queryForObject(
                    "SELECT payment_status FROM trade.order_group WHERE id = ?", String.class, orderGroupId);
            if ("paid".equals(status)) {
                return;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
        }
        throw new AssertionError("订单没有在时限内置为已付: " + orderGroupId);
    }

    // —— 种子 ——

    private record Seed(UUID skuId, UUID merchantId) {}

    private Seed seedSellable(long price, int stock) {
        UUID categoryId = Ids.newId();
        jdbc.update(
                "INSERT INTO catalog.category (id, path, level, code, name) VALUES (?, ?, 3, ?, '测试类目')",
                categoryId,
                "/" + Ids.newId() + "/" + Ids.newId() + "/" + categoryId + "/",
                "C" + Math.abs(categoryId.hashCode()));
        UUID spuId = Ids.newId();
        jdbc.update("INSERT INTO catalog.spu (id, category_id, title) VALUES (?, ?, '测试商品')", spuId, categoryId);
        UUID skuId = Ids.newId();
        jdbc.update(
                "INSERT INTO catalog.sku (id, spu_id, spec_values, spec_key, price_amount, price_currency, status)"
                        + " VALUES (?, ?, '{}'::jsonb, ?, ?, 'CNY', 'active')",
                skuId,
                spuId,
                "spec-" + skuId,
                price);
        UUID merchantId = Ids.newId();
        UUID shopId = Ids.newId();
        jdbc.update("INSERT INTO seller.shop (id, merchant_id, name) VALUES (?, ?, '测试店')", shopId, merchantId);
        jdbc.update(
                "INSERT INTO catalog.offer (id, spu_id, merchant_id, shop_id, status) VALUES (?, ?, ?, ?, 'online')",
                Ids.newId(),
                spuId,
                merchantId,
                shopId);
        jdbc.update(
                "INSERT INTO seller.shipping_template (id, shop_id, name, charge_by, regions, status)"
                        + " VALUES (?, ?, ?, 'piece', ?::jsonb, 'active')",
                Ids.newId(),
                shopId,
                "测试运费",
                "[{\"areaCodes\": [], \"first\": 1, \"firstFee\": 800, \"additional\": 1, \"additionalFee\": 200}]");
        jdbc.update(
                "INSERT INTO inventory.stock (sku_id, warehouse_id, merchant_id, on_hand, available, reserved, safety)"
                        + " VALUES (?, ?, ?, ?, ?, 0, 0)",
                skuId,
                WAREHOUSE,
                merchantId,
                stock,
                stock);
        return new Seed(skuId, merchantId);
    }

    private static AddressRequest addressRequest() {
        return new AddressRequest("张三", "13800000000", "440305", "广东省", "深圳市", "南山区", "科技园路 1 号 2 栋 301", null, null);
    }
}
