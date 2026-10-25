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
import com.shop.platform.logistics.controller.TracePushController;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.pricing.dto.QuoteResponse;
import com.shop.platform.pricing.service.PriceQuoteService;
import com.shop.platform.trade.api.PlaceOrderRequest;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.service.PaymentStarter;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * 轨迹推送摄取：验签（fail closed）、翻码（查无映射记 unknown 绝不猜）、幂等（三元组重放不再推进）。
 * 密钥用随机生成值经 {@code @DynamicPropertySource} 注入——测试里也不落任何像密钥的字面量。
 */
@SpringBootTest
@ActiveProfiles("test")
class TraceIngestTest {

    /** 每次运行换一把：证明服务端读的是配置，不是某个写死的值。 */
    private static final String PUSH_SECRET = "test-" + UUID.randomUUID();

    @DynamicPropertySource
    static void pushSecret(DynamicPropertyRegistry registry) {
        registry.add("shop.logistics.push-secret", () -> PUSH_SECRET);
    }

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
    private TracePushController pushController;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void 签名通过_翻码推进_重放只生效一次() {
        seedCodeMap("sf", "MOVE", "in_transit");
        seedCodeMap("sf", "SIGNED", "delivered");
        Paid paid = placePaidOrder();
        UUID packageId = ship(paid);

        String move = body(paid.trackingNo(), "MOVE");
        assertThat(pushSigned(move)).containsEntry("standardCode", "in_transit");
        assertThat(packageStatus(packageId)).isEqualTo("in_transit");

        String signed = body(paid.trackingNo(), "SIGNED");
        assertThat(pushSigned(signed)).containsEntry("standardCode", "delivered");
        assertThat(packageStatus(packageId)).isEqualTo("delivered");
        assertThat(deliveredSource(packageId)).isEqualTo("trace");
        assertThat(jdbc.queryForObject(
                        "SELECT fulfillment_status FROM trade.seller_order WHERE id = ?",
                        String.class,
                        paid.sellerOrderId()))
                .isEqualTo("received");

        // 同一条推送重放：trace_event 唯一键挡住，签收不重复记、订单不重复完成
        assertThat(pushSigned(signed)).containsEntry("standardCode", "delivered");
        assertThat(traceCount(packageId)).isEqualTo(2);
        assertThat(jdbc.queryForObject(
                        "SELECT received_qty FROM trade.order_line WHERE seller_order_id = ?",
                        Integer.class,
                        paid.sellerOrderId()))
                .isEqualTo(1);
    }

    @Test
    void 签名不对拒收_且不落任何轨迹() {
        seedCodeMap("sf", "MOVE", "in_transit");
        Paid paid = placePaidOrder();
        UUID packageId = ship(paid);

        String move = body(paid.trackingNo(), "MOVE");
        assertThatThrownBy(
                        () -> pushController.push("sf", "deadbeef", String.valueOf(System.currentTimeMillis()), move))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(403));

        assertThat(traceCount(packageId)).isZero();
        assertThat(packageStatus(packageId)).isEqualTo("shipped");
    }

    @Test
    void 码表查无映射记unknown_状态不动() {
        Paid paid = placePaidOrder();
        UUID packageId = ship(paid);

        String weird = body(paid.trackingNo(), "SOME_NEW_CODE");
        assertThat(pushSigned(weird)).containsEntry("standardCode", "unknown");

        assertThat(traceCount(packageId)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                        "SELECT standard_code FROM logistics.trace_event WHERE package_id = ?",
                        String.class,
                        packageId))
                .isEqualTo("unknown");
        assertThat(packageStatus(packageId)).isEqualTo("shipped");
    }

    @Test
    void 运单不存在404() {
        String body = body("SF0000000000", "MOVE");
        assertThatThrownBy(() -> pushSigned(body))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(404));
    }

    // —— 推送构造 ——

    private static String body(String trackingNo, String code) {
        return "{\"trackingNo\":\""
                + trackingNo + "\",\"code\":\"" + code + "\",\"description\":\"测试轨迹\",\"occurredAt\":\""
                + Instant.now().toString() + "\"}";
    }

    /** 签名串 = body + LF + 时间戳（毫秒），与 TraceSignature 的口径一致；时间戳现取现签，过窗逻辑不在这里测。 */
    private java.util.Map<String, String> pushSigned(String rawBody) {
        String timestamp = String.valueOf(System.currentTimeMillis());
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(PUSH_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String signature = HexFormat.of().formatHex(mac.doFinal(signedString(rawBody, timestamp)));
            return pushController.push("sf", signature, timestamp, rawBody);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] signedString(String rawBody, String timestamp) {
        byte[] lf = new byte[] {'\n'};
        byte[] body = rawBody.getBytes(StandardCharsets.UTF_8);
        byte[] ts = timestamp.getBytes(StandardCharsets.UTF_8);
        byte[] joined = new byte[body.length + lf.length + ts.length];
        System.arraycopy(body, 0, joined, 0, body.length);
        System.arraycopy(lf, 0, joined, body.length, lf.length);
        System.arraycopy(ts, 0, joined, body.length + lf.length, ts.length);
        return joined;
    }

    private void seedCodeMap(String carrier, String raw, String standard) {
        jdbc.update(
                "INSERT INTO logistics.carrier_code_map (carrier_code, raw_code, standard_code) VALUES (?, ?, ?)"
                        + " ON CONFLICT (carrier_code, raw_code) DO NOTHING",
                carrier,
                raw,
                standard);
    }

    private String packageStatus(UUID packageId) {
        return jdbc.queryForObject("SELECT status FROM fulfillment.package WHERE id = ?", String.class, packageId);
    }

    private String deliveredSource(UUID packageId) {
        return jdbc.queryForObject(
                "SELECT delivered_source FROM fulfillment.package WHERE id = ?", String.class, packageId);
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
