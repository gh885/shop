package com.shop.platform.fulfillment;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.common.id.Ids;
import com.shop.platform.fulfillment.api.FulfillmentCommand;
import com.shop.platform.fulfillment.api.StandardTraceCode;
import com.shop.platform.fulfillment.service.FulfillmentService;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.pricing.dto.QuoteResponse;
import com.shop.platform.pricing.service.PriceQuoteService;
import com.shop.platform.testsupport.IntegrationTest;
import com.shop.platform.trade.api.PlaceOrderRequest;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.service.PaymentStarter;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 轨迹回写状态机：八码推进、单调只升不降、delivered 视同签收（trace 来源）走订单完成。
 * 这是 fulfillment.md §2.3 那张表的可执行版。
 */
class RecordTraceTest extends IntegrationTest {

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

    @Test
    void 八码顺序推进_迟到轨迹退不回去_delivered视同签收() {
        Paid paid = placePaidOrder();
        UUID packageId = ship(paid);

        // 揽收：只证明货交出去了，状态不动
        fulfillment.recordTrace(packageId, StandardTraceCode.COLLECTED, Instant.now(), null);
        assertThat(packageStatus(packageId)).isEqualTo("shipped");

        // 运输 / 派送：推进到 in_transit
        fulfillment.recordTrace(packageId, StandardTraceCode.IN_TRANSIT, Instant.now(), null);
        assertThat(packageStatus(packageId)).isEqualTo("in_transit");
        fulfillment.recordTrace(packageId, StandardTraceCode.OUT_FOR_DELIVERY, Instant.now(), null);
        assertThat(packageStatus(packageId)).isEqualTo("in_transit");

        // exception：只记录，状态不动
        fulfillment.recordTrace(packageId, StandardTraceCode.EXCEPTION, Instant.now(), null);
        assertThat(packageStatus(packageId)).isEqualTo("in_transit");

        // 签收：trace 来源，和买家手点同一条写路径——订单随之完成
        fulfillment.recordTrace(packageId, StandardTraceCode.DELIVERED, Instant.now(), null);
        assertThat(packageStatus(packageId)).isEqualTo("delivered");
        assertThat(deliveredSource(packageId)).isEqualTo("trace");
        assertThat(jdbc.queryForObject(
                        "SELECT fulfillment_status FROM trade.seller_order WHERE id = ?",
                        String.class,
                        paid.sellerOrderId()))
                .isEqualTo("received");

        // 迟到的"运输中"：终态之后任何码都不改状态——否则一条延迟轨迹能让买家页跳回"运输中"
        fulfillment.recordTrace(packageId, StandardTraceCode.IN_TRANSIT, Instant.now(), null);
        assertThat(packageStatus(packageId)).isEqualTo("delivered");
        assertThat(jdbc.queryForObject(
                        "SELECT received_qty FROM trade.order_line WHERE seller_order_id = ?",
                        Integer.class,
                        paid.sellerOrderId()))
                .isEqualTo(1);
    }

    @Test
    void 拒收与退回置returned_终态不再被签收() {
        Paid paid = placePaidOrder();
        UUID packageId = ship(paid);

        assertThat(fulfillment.recordTrace(packageId, StandardTraceCode.REJECTED, Instant.now(), null))
                .isTrue();
        assertThat(packageStatus(packageId)).isEqualTo("returned");

        // 退回之后再收到"签收"：不动，也不签收订单——这就是"猜错会把退签当签收"要防的事故
        fulfillment.recordTrace(packageId, StandardTraceCode.DELIVERED, Instant.now(), null);
        assertThat(packageStatus(packageId)).isEqualTo("returned");
        assertThat(jdbc.queryForObject(
                        "SELECT fulfillment_status FROM trade.seller_order WHERE id = ?",
                        String.class,
                        paid.sellerOrderId()))
                .isEqualTo("shipped");
    }

    // —— 下单 / 支付 / 发货 ——

    private record Paid(UUID buyerId, UUID orderGroupId, UUID sellerOrderId, UUID merchantId) {}

    private UUID ship(Paid paid) {
        FulfillmentCommand.ShippedPackage shipped = fulfillment.ship(new FulfillmentCommand.ShipRequest(
                paid.sellerOrderId(),
                paid.merchantId(),
                java.util.Set.of(shopIdOf(paid)),
                "sf",
                "SF" + Ids.newId(),
                List.of(new FulfillmentCommand.ShipItem(1, 1))));
        return shipped.packageId();
    }

    /** 发货范围用的店铺 id：种子走真实下单链路，shop_id 以落库的子单为准。 */
    private UUID shopIdOf(Paid paid) {
        return jdbc.queryForObject(
                "SELECT shop_id FROM trade.seller_order WHERE id = ?", UUID.class, paid.sellerOrderId());
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
        return new Paid(buyer, placed.orderGroupId(), sellerOrderId, goods.merchantId());
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

    private String packageStatus(UUID packageId) {
        return jdbc.queryForObject("SELECT status FROM fulfillment.package WHERE id = ?", String.class, packageId);
    }

    private String deliveredSource(UUID packageId) {
        return jdbc.queryForObject(
                "SELECT delivered_source FROM fulfillment.package WHERE id = ?", String.class, packageId);
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
        UUID merchantId = Ids.newId();
        jdbc.update(
                "INSERT INTO catalog.spu (id, merchant_id, category_id, title) VALUES (?, ?, ?, '测试商品')",
                spuId,
                merchantId,
                categoryId);
        UUID skuId = Ids.newId();
        jdbc.update(
                "INSERT INTO catalog.sku (id, spu_id, spec_values, spec_key, price_amount, price_currency, status)"
                        + " VALUES (?, ?, '{}'::jsonb, ?, ?, 'CNY', 'active')",
                skuId,
                spuId,
                "spec-" + skuId,
                price);
        UUID shopId = Ids.newId();
        jdbc.update("INSERT INTO seller.shop (id, merchant_id, name) VALUES (?, ?, '测试店')", shopId, merchantId);
        jdbc.update(
                "INSERT INTO catalog.listing (id, spu_id, merchant_id, shop_id, status) VALUES (?, ?, ?, ?, 'online')",
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
                "INSERT INTO inventory.stock (sku_id, warehouse_id, merchant_id, on_hand, available_to_promise, reserved, safety)"
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
