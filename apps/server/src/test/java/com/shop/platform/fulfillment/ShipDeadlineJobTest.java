package com.shop.platform.fulfillment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.fulfillment.api.FulfillmentCommand;
import com.shop.platform.fulfillment.service.FulfillmentService;
import com.shop.platform.fulfillment.service.ShipDeadlineJob;
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
 * 发货时效检测：超时置 overdue 并把线索报给 governance；两类"正确地没发货"（订单关闭、
 * 未发货就全额退款）作废任务而不是报违规——检测的信誉比覆盖率重要。
 */
class ShipDeadlineJobTest extends IntegrationTest {

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
    private ShipDeadlineJob deadlineJob;

    @Test
    void 承诺时间过了没发货_置逾期并报线索_重跑不重复() {
        Paid paid = placePaidOrder();
        awaitShipTask(paid.sellerOrderId());

        // 没到承诺时间：不动
        deadlineJob.runNow();
        assertThat(taskStatus(paid.sellerOrderId())).isEqualTo("pending");

        jdbc.update(
                "UPDATE fulfillment.ship_task SET due_at = now() - interval '1 hour' WHERE seller_order_id = ?",
                paid.sellerOrderId());
        deadlineJob.runNow();

        assertThat(taskStatus(paid.sellerOrderId())).isEqualTo("overdue");
        assertThat(jdbc.queryForObject(
                        "SELECT overdue_at IS NOT NULL FROM fulfillment.ship_task WHERE seller_order_id = ?",
                        Boolean.class,
                        paid.sellerOrderId()))
                .isTrue();
        assertThat(clueCount(paid.sellerOrderId())).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                        "SELECT merchant_id FROM governance.violation_clue WHERE seller_order_id = ?",
                        UUID.class,
                        paid.sellerOrderId()))
                .isEqualTo(paid.merchantId());

        // 再跑：任务已不是 pending，且线索有幂等键——不重复
        deadlineJob.runNow();
        assertThat(clueCount(paid.sellerOrderId())).isEqualTo(1);
    }

    @Test
    void 订单关闭的任务作废_不报违规() {
        Paid paid = placePaidOrder();
        awaitShipTask(paid.sellerOrderId());
        jdbc.update(
                "UPDATE fulfillment.ship_task SET due_at = now() - interval '1 hour' WHERE seller_order_id = ?",
                paid.sellerOrderId());
        jdbc.update(
                "UPDATE trade.order_group SET closed_at = now(), closed_reason = 'refunded' WHERE id = ?",
                paid.orderGroupId());

        deadlineJob.runNow();

        assertThat(taskStatus(paid.sellerOrderId())).isEqualTo("cancelled");
        assertThat(clueCount(paid.sellerOrderId())).isZero();
    }

    @Test
    void 未发货就全额退款_任务作废_且发货被拒() {
        Paid paid = placePaidOrder();
        awaitShipTask(paid.sellerOrderId());
        jdbc.update(
                "UPDATE fulfillment.ship_task SET due_at = now() - interval '1 hour' WHERE seller_order_id = ?",
                paid.sellerOrderId());
        // 全额退款未发货：行的可发量归零
        jdbc.update(
                "UPDATE trade.order_line SET refunded_qty = quantity WHERE seller_order_id = ?", paid.sellerOrderId());

        deadlineJob.runNow();
        assertThat(taskStatus(paid.sellerOrderId())).isEqualTo("cancelled");
        assertThat(clueCount(paid.sellerOrderId())).isZero();

        // 钱货两得的闸门：全退了还去发货，可发量为 0，当场拒
        assertThatThrownBy(() -> fulfillment.ship(new FulfillmentCommand.ShipRequest(
                        paid.sellerOrderId(),
                        paid.merchantId(),
                        java.util.Set.of(shopIdOf(paid)),
                        "sf",
                        "SF" + Ids.newId(),
                        List.of(new FulfillmentCommand.ShipItem(1, 1)))))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(409));
    }

    // —— 下单 / 支付 ——

    private record Paid(UUID buyerId, UUID orderGroupId, UUID sellerOrderId, UUID merchantId) {}

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

    /** 建任务是 OrderPaid 的异步监听，轮询等它落库。 */
    private void awaitShipTask(UUID sellerOrderId) {
        for (int i = 0; i < 100; i++) {
            String status = taskStatus(sellerOrderId);
            if (status != null) {
                return;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
        }
        throw new AssertionError("发货任务没有建出来: " + sellerOrderId);
    }

    private String taskStatus(UUID sellerOrderId) {
        List<String> rows = jdbc.queryForList(
                "SELECT status FROM fulfillment.ship_task WHERE seller_order_id = ?", String.class, sellerOrderId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private int clueCount(UUID sellerOrderId) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM governance.violation_clue WHERE seller_order_id = ?",
                Integer.class,
                sellerOrderId);
        return count == null ? 0 : count;
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
