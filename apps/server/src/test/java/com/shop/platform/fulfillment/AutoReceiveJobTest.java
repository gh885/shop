package com.shop.platform.fulfillment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.fulfillment.api.FulfillmentCommand;
import com.shop.platform.fulfillment.service.AutoReceiveJob;
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
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 自动确认收货与发货入口的两条底线：
 *
 * <ul>
 *   <li>买家不点"确认收货"，发货后 10 天系统替他点——订单完成、{@code OrderCompleted}
 *       该发的都发，商家的钱不再冻在 clearing；到期之前一分钟都不许提前
 *   <li>承运商必须过白名单——填错码当场 400，不留半个包裹
 * </ul>
 */
class AutoReceiveJobTest extends IntegrationTest {

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
    private AutoReceiveJob autoReceive;

    @Test
    void 发货十天后系统替买家确认_订单完成() {
        Paid paid = placePaidOrder(1_500);
        UUID packageId = ship(paid, "sf", "SF" + Ids.newId());

        // 未到 10 天：一个都不许动
        autoReceive.runNow();
        assertThat(packageStatus(packageId)).isEqualTo("shipped");

        // 过了 10 天还挂着：系统签收，来源记 system
        jdbc.update("UPDATE fulfillment.package SET shipped_at = now() - interval '11 days' WHERE id = ?", packageId);
        autoReceive.runNow();

        assertThat(packageStatus(packageId)).isEqualTo("delivered");
        assertThat(jdbc.queryForObject(
                        "SELECT delivered_source FROM fulfillment.package WHERE id = ?", String.class, packageId))
                .isEqualTo("system");
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

        // 再跑一轮：CAS 输掉，什么都不变
        autoReceive.runNow();
        assertThat(packageStatus(packageId)).isEqualTo("delivered");
    }

    @Test
    void 买家先确认_任务再跑不重复计数() {
        Paid paid = placePaidOrder(2_000);
        // 大小写不敏感：SF 和 sf 是同一家
        UUID packageId = ship(paid, "SF", "SF" + Ids.newId());

        assertThat(fulfillment.deliver(packageId, paid.buyerId())).isTrue();
        assertThat(jdbc.queryForObject(
                        "SELECT delivered_source FROM fulfillment.package WHERE id = ?", String.class, packageId))
                .isEqualTo("buyer");

        // 到期后任务再扫：终态跳过，签收计数不被重复记
        jdbc.update("UPDATE fulfillment.package SET shipped_at = now() - interval '11 days' WHERE id = ?", packageId);
        autoReceive.runNow();

        assertThat(packageStatus(packageId)).isEqualTo("delivered");
        assertThat(jdbc.queryForObject(
                        "SELECT delivered_source FROM fulfillment.package WHERE id = ?", String.class, packageId))
                .isEqualTo("buyer");
        assertThat(receivedQty(paid.sellerOrderId())).isEqualTo(1);
    }

    @Test
    void 未知承运商当场拒_不留包裹() {
        Paid paid = placePaidOrder(1_000);

        assertThatThrownBy(() -> ship(paid, "fedex-typo", "T" + Ids.newId()))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getHttpStatus()).isEqualTo(400);
                    assertThat(e.getMessage()).contains("未知承运商").contains("顺丰速运");
                });

        Integer packages = jdbc.queryForObject(
                "SELECT count(*) FROM fulfillment.package WHERE seller_order_id = ?",
                Integer.class,
                paid.sellerOrderId());
        assertThat(packages).isZero();
    }

    // —— 下单 / 支付 / 发货 ——

    private record Paid(UUID buyerId, UUID orderGroupId, UUID sellerOrderId, UUID merchantId) {}

    private UUID ship(Paid paid, String carrier, String trackingNo) {
        FulfillmentCommand.ShippedPackage shipped = fulfillment.ship(new FulfillmentCommand.ShipRequest(
                paid.sellerOrderId(),
                paid.merchantId(),
                java.util.Set.of(shopIdOf(paid)),
                carrier,
                trackingNo,
                List.of(new FulfillmentCommand.ShipItem(1, 1))));
        return shipped.packageId();
    }

    /** 发货范围用的店铺 id：种子走真实下单链路，shop_id 以落库的子单为准。 */
    private UUID shopIdOf(Paid paid) {
        return jdbc.queryForObject(
                "SELECT shop_id FROM trade.seller_order WHERE id = ?", UUID.class, paid.sellerOrderId());
    }

    private Paid placePaidOrder(long price) {
        UUID buyer = UUID.randomUUID();
        AddressView address = addresses.create(buyer, addressRequest());
        Seed goods = seedSellable(price, 10);

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

    /** 置已付是 AFTER_COMMIT 异步监听，轮询等它落库，发货前置就是"已付款"。 */
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

    private int receivedQty(UUID sellerOrderId) {
        return jdbc.queryForObject(
                "SELECT received_qty FROM trade.order_line WHERE seller_order_id = ?", Integer.class, sellerOrderId);
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
