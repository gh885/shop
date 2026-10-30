package com.shop.platform.trade;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.common.id.Ids;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.pricing.dto.QuoteResponse;
import com.shop.platform.pricing.service.PriceQuoteService;
import com.shop.platform.testsupport.IntegrationTest;
import com.shop.platform.trade.api.PlaceOrderRequest;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.service.OrderExpiryJob;
import com.shop.platform.trade.service.PaymentStarter;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 发起支付的期限契约：支付单有效期锚到订单可付期限（expiresAt + 5 分钟关单宽限），
 * 不比订单活得久；以及那条最坏路径的闭环——用户在订单已关后才完成支付，
 * 迟到的钱不再消失，落进挂账台账等人退。
 */
class PaymentDeadlineTest extends IntegrationTest {

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
    private OrderExpiryJob expiryJob;

    @Test
    void 支付单有效期等于订单可付期限加宽限() {
        UUID buyer = UUID.randomUUID();
        Placed placed = placeOrder(buyer, 1_500);

        // 订单只剩 10 分钟可付：支付单只能活到第 15 分钟（10 + 5 分钟关单宽限），
        // 而不是从点支付起再数 30 分钟——那是"渠道还在收一笔永远推进不了订单的钱"的窗口
        jdbc.update(
                "UPDATE trade.order_group SET expires_at = now() + interval '10 minutes' WHERE id = ?",
                placed.orderGroupId());

        PaymentView view = paymentStarter.start(placed.orderGroupId(), buyer);
        Instant orderExpireAt = jdbc.queryForObject(
                "SELECT expires_at FROM trade.order_group WHERE id = ?", Instant.class, placed.orderGroupId());

        assertThat(view.expiresAt()).isEqualTo(orderExpireAt.plusSeconds(300));
    }

    @Test
    void 订单关掉后钱才到_落挂账而不是消失() throws Exception {
        UUID buyer = UUID.randomUUID();
        Placed placed = placeOrder(buyer, 1_500);

        PaymentView view = paymentStarter.start(placed.orderGroupId(), buyer);

        // 支付单还活着（mock 渠道不管过期），订单先被关单任务关掉
        jdbc.update(
                "UPDATE trade.order_group SET expires_at = now() - interval '10 minutes' WHERE id = ?",
                placed.orderGroupId());
        expiryJob.runNow();
        String closedReason = jdbc.queryForObject(
                "SELECT closed_reason FROM trade.order_group WHERE id = ?", String.class, placed.orderGroupId());
        assertThat(closedReason).isEqualTo("timeout");

        // 用户在支付宝页面完成了支付，主动查单把钱落进来
        paymentService.confirm(view.paymentId(), buyer);

        // 支付单承认钱到了；订单推进不了；挂账台账里有一行 order_closed，等管理端退款
        assertThat(jdbc.queryForObject(
                        "SELECT status FROM payment.payment_order WHERE id = ?", String.class, view.paymentId()))
                .isEqualTo("success");
        assertThat(jdbc.queryForObject(
                        "SELECT payment_status FROM trade.order_group WHERE id = ?",
                        String.class,
                        placed.orderGroupId()))
                .isEqualTo("unpaid");

        awaitSuspense(view.paymentId());
        String reason = jdbc.queryForObject(
                "SELECT reason FROM payment.suspense_entry WHERE payment_id = ?", String.class, view.paymentId());
        assertThat(reason).isEqualTo("order_closed");
    }

    // —— 下单链路 ——

    private record Placed(UUID orderGroupId) {}

    private Placed placeOrder(UUID buyer, long price) {
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
        return new Placed(placed.orderGroupId());
    }

    private record Seed(UUID skuId) {}

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
        return new Seed(skuId);
    }

    private static AddressRequest addressRequest() {
        return new AddressRequest("张三", "13800000000", "440305", "广东省", "深圳市", "南山区", "科技园路 1 号 2 栋 301", null, null);
    }

    /** 挂账由异步事件监听器写入（AFTER_COMMIT + @Async），轮询等它落库。 */
    private void awaitSuspense(UUID paymentId) throws InterruptedException {
        for (int i = 0; i < 100; i++) {
            Integer count = jdbc.queryForObject(
                    "SELECT count(*) FROM payment.suspense_entry WHERE payment_id = ?", Integer.class, paymentId);
            if (count != null && count > 0) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("迟到支付没有落挂账: " + paymentId);
    }
}
