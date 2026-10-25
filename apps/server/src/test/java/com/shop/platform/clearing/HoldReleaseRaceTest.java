package com.shop.platform.clearing;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.clearing.service.SettlementService;
import com.shop.platform.common.id.Ids;
import com.shop.platform.fulfillment.api.FulfillmentCommand;
import com.shop.platform.fulfillment.service.FulfillmentService;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.pricing.dto.QuoteResponse;
import com.shop.platform.pricing.service.PriceQuoteService;
import com.shop.platform.returns.api.CaseView;
import com.shop.platform.returns.api.RmaCommand;
import com.shop.platform.trade.api.PlaceOrderRequest;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.service.PaymentStarter;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * 售后冻结与"订单完成解冻 / 结算打款"的竞速。修这条之前：买家未收货仅退款（冻结）+
 * 订单完成（买家确认/10 天自动确认），解冻按全额划账——pending 划成负数、available
 * 多出一笔冻着的钱，结算批次照打，商家把冻着的钱提走，缺口挂死在 pending 上。
 *
 * <p>三个出口都要认冻结：完成解冻（release）、撤销解冻（releaseHold 的回款目的地）、
 * 结算打款（batch 净额）。这里各钉一条。
 */
@SpringBootTest
@ActiveProfiles("test")
class HoldReleaseRaceTest {

    /** 压款期归零：结算那条用例要当场可结。 */
    @DynamicPropertySource
    static void noHold(DynamicPropertyRegistry registry) {
        registry.add("shop.clearing.hold", () -> "PT0S");
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
    private RmaCommand rma;

    @Autowired
    private SettlementService settlement;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void 仅退款开着时订单完成_冻结不被解冻击穿_退款成功后冻结清零() {
        Paid paid = placePaidOrder(1_500, 1);

        // 未收货仅退款：整行全退（1/1 件）。行 payableAmount 只含商品款（运费不退），退款 1500、
        // 商家承担份额 = 1500×净额2225/应付2300 = 1451
        CaseView caseView = applyRefundOnly(paid, 1);
        long frozenAmount = 1_451;
        assertThat(balances(paid.merchantId())).containsEntry("held", frozenAmount);

        // 订单完成（买家确认收货）：解冻必须扣掉还冻着的钱——available 只能拿到剩下的 774
        UUID packageId = ship(paid);
        assertThat(fulfillment.deliver(packageId, paid.buyerId())).isTrue();
        awaitReleased(paid.sellerOrderId());

        Map<String, Long> afterRelease = balances(paid.merchantId());
        assertThat(afterRelease.get("pending")).isZero();
        assertThat(afterRelease.get("available")).isEqualTo(774L);
        assertThat(afterRelease.get("held")).isEqualTo(frozenAmount);

        // 商家同意：mock 渠道当场退成。冻结被冲销吃掉是 RefundSucceeded 的
        // AFTER_COMMIT 异步监听，轮询等它落账；运费对应的净额留在商家手里
        rma.approve(caseView.id(), paid.merchantId());
        await("冻结冲销", () -> String.valueOf(balances(paid.merchantId()).get("held")), "0");
        Map<String, Long> afterRefund = balances(paid.merchantId());
        assertThat(afterRefund.get("pending")).isZero();
        assertThat(afterRefund.get("available")).isEqualTo(774L);
        assertThat(afterRefund.get("held")).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM returns.rma_case WHERE id = ?", String.class, caseView.id()))
                .isEqualTo("completed");
    }

    @Test
    void 订单完成后撤销售后_冻结回available不挂死pending() {
        Paid paid = placePaidOrder(1_500, 1);
        CaseView caseView = applyRefundOnly(paid, 1);

        UUID packageId = ship(paid);
        assertThat(fulfillment.deliver(packageId, paid.buyerId())).isTrue();
        awaitReleased(paid.sellerOrderId());

        // 撤销：钱现在的家是 available（解冻按"扣掉冻结"划过了账），
        // 按冻结时记的 source 回 pending 就会挂死——pending 只有订单完成一条出口
        rma.cancel(caseView.id(), paid.buyerId());

        Map<String, Long> balances = balances(paid.merchantId());
        assertThat(balances.get("pending")).isZero();
        assertThat(balances.get("available")).isEqualTo(2_225L);
        assertThat(balances.get("held")).isZero();
    }

    @Test
    void 冻着的明细不进结算批次_撤销解冻后下一批照结() {
        // 两件退一件：应付 4000（含按件运费 800+200）、佣金 150、净额 3850；
        // 行 payableAmount 只含商品款，退 1/2 件 = 1500，商家份额 1500×3850/4000 = 1443
        Paid paid = placePaidOrder(1_500, 2);
        CaseView caseView = applyRefundOnly(paid, 1);
        assertThat(balances(paid.merchantId())).containsEntry("held", 1_443L);

        UUID packageId = ship(paid, 2);
        assertThat(fulfillment.deliver(packageId, paid.buyerId())).isTrue();
        awaitReleased(paid.sellerOrderId());

        // 压款期为零，但批次认领（DUE_ITEMS 的 NOT EXISTS held）挡住有未终态冻结的明细
        assertThat(settlement.settleMerchant(paid.merchantId(), "CNY", Instant.now()))
                .isFalse();
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM clearing.settlement_batch WHERE merchant_id = ?",
                        Integer.class,
                        paid.merchantId()))
                .isZero();

        // 买家撤销：冻结解回 available，明细还是 released——下一批照常把全额净额结走
        rma.cancel(caseView.id(), paid.buyerId());
        Map<String, Long> afterCancel = balances(paid.merchantId());
        assertThat(afterCancel.get("held")).isZero();
        assertThat(afterCancel.get("available")).isEqualTo(3_850L);

        assertThat(settlement.settleMerchant(paid.merchantId(), "CNY", Instant.now()))
                .isTrue();
        Map<String, Long> afterSettle = balances(paid.merchantId());
        assertThat(afterSettle.get("available")).isZero();
        assertThat(afterSettle.get("held")).isZero();
        assertThat(jdbc.queryForObject(
                        "SELECT net_amount FROM clearing.settlement_batch WHERE merchant_id = ?",
                        Long.class,
                        paid.merchantId()))
                .isEqualTo(3_850L);
    }

    // —— 场景构造 ——

    private record Paid(UUID buyerId, UUID orderGroupId, UUID sellerOrderId, UUID merchantId) {}

    private CaseView applyRefundOnly(Paid paid, int quantity) {
        return rma.apply(new RmaCommand.ApplyRequest(
                paid.buyerId(),
                paid.sellerOrderId(),
                "REFUND_ONLY",
                "QUALITY",
                List.of(new RmaCommand.ApplyRequest.Line(1, quantity))));
    }

    private UUID ship(Paid paid, int quantity) {
        FulfillmentCommand.ShippedPackage shipped = fulfillment.ship(new FulfillmentCommand.ShipRequest(
                paid.sellerOrderId(),
                paid.merchantId(),
                "sf",
                "SF" + Ids.newId(),
                List.of(new FulfillmentCommand.ShipItem(1, quantity))));
        return shipped.packageId();
    }

    private UUID ship(Paid paid) {
        return ship(paid, 1);
    }

    private Paid placePaidOrder(long price, int quantity) {
        UUID buyer = UUID.randomUUID();
        AddressView address = addresses.create(buyer, addressRequest());
        Seed goods = seedSellable(price, 10);

        QuoteResponse quote = quotes.quote(new PricingRequest(
                buyer,
                new PricingRequest.Address("44", "4403", "440305"),
                List.of(PricingRequest.Line.of(1, goods.skuId(), quantity)),
                List.of()));

        TradeCommand.PlacedOrder placed = orders.placeOrder(new PlaceOrderRequest(
                buyer,
                quote.quoteId(),
                address.id(),
                List.of(PlaceOrderRequest.Line.of(1, goods.skuId(), null, quantity)),
                null));

        PaymentView view = paymentStarter.start(placed.orderGroupId(), buyer);
        paymentService.confirm(view.paymentId(), buyer);
        awaitPaid(placed.orderGroupId());

        UUID sellerOrderId = jdbc.queryForObject(
                "SELECT id FROM trade.seller_order WHERE group_id = ?", UUID.class, placed.orderGroupId());
        return new Paid(buyer, placed.orderGroupId(), sellerOrderId, goods.merchantId());
    }

    private void awaitPaid(UUID orderGroupId) {
        await(
                "订单置为已付",
                () -> jdbc.queryForObject(
                        "SELECT payment_status FROM trade.order_group WHERE id = ?", String.class, orderGroupId),
                "paid");
    }

    /** 解冻是 OrderCompleted 的 AFTER_COMMIT 异步监听，轮询等它落账。 */
    private void awaitReleased(UUID sellerOrderId) {
        await(
                "结算明细解冻",
                () -> jdbc.queryForObject(
                        "SELECT status FROM clearing.settlement_item WHERE seller_order_id = ?",
                        String.class,
                        sellerOrderId),
                "released");
    }

    private void await(String what, java.util.function.Supplier<String> query, String expected) {
        for (int i = 0; i < 100; i++) {
            if (expected.equals(query.get())) {
                return;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
        }
        throw new AssertionError(what + "没有在时限内完成");
    }

    /** 商家三个桶的余额：直接从分录聚合，和读侧同一个事实源。 */
    private Map<String, Long> balances(UUID merchantId) {
        Map<String, Long> result = new HashMap<>();
        jdbc.query(
                "SELECT a.account_type, COALESCE(SUM(e.amount), 0)"
                        + "  FROM clearing.ledger_entry e JOIN clearing.ledger_account a ON a.id = e.account_id"
                        + " WHERE a.owner_type = 'merchant' AND a.owner_id = ? GROUP BY a.account_type",
                rs -> {
                    result.put(rs.getString(1), rs.getLong(2));
                },
                merchantId);
        return result;
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
