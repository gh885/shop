package com.shop.platform.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
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
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 库存账本在<b>真实链路</b>上走一遍：下单预占 → 支付确认 → 发货出库 → 退货入库。
 *
 * <p>{@link InventoryLedgerTest} 手写库存行，只管账本自己；这个类拉上 trade / fulfillment / returns，
 * 守的是「别人真的调到了我」——那是这次补齐之前最严重的两个洞：
 *
 * <ul>
 *   <li>发货从来不扣实物账（{@code InventoryCommand.ship} 零调用）
 *   <li>退货从来不回补（{@code StockMoveType.RESTOCK} 有枚举值没有实现）
 * </ul>
 *
 * <p>两个洞的共同特征是「接口都在、没人调」，而单元测试各自绿。只有端到端跑一遍才看得见。
 */
@SpringBootTest
@ActiveProfiles("test")
class InventoryFlowTest {

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
    private JdbcTemplate jdbc;

    /**
     * 一条完整链路走完，四科目的每一跳都要对得上。
     *
     * <p>守恒式 {@code 实物 = 可售 + 预占 + 安全} 在每一步都成立（库约束保证），
     * 所以这里断的是"哪一列动了、动了多少"——那才是账本的语义。
     */
    @Test
    void 下单到发货到退货_四个科目每一步都对得上() {
        Paid paid = placePaidOrder(2);

        // 下单：可售 -2、预占 +2，实物不动（货还在仓里）
        assertThat(onHand(paid.skuId())).isEqualTo(10);
        assertThat(availableToPromise(paid.skuId())).isEqualTo(8);
        assertThat(reserved(paid.skuId())).isEqualTo(2);
        assertThat(ledgerCount("reserve", paid.skuId())).isEqualTo(1);

        // 支付成功：只推状态，四个科目一个都不动
        assertThat(onHand(paid.skuId())).isEqualTo(10);
        assertThat(reserved(paid.skuId())).isEqualTo(2);
        assertThat(reservationStatus(paid.sellerOrderId())).isEqualTo("committed");

        // 发货：预占 -2、实物 -2，可售不动——"还能卖几件"在预占那一刻就减过了
        UUID packageId = ship(paid, 2);
        assertThat(onHand(paid.skuId())).isEqualTo(8);
        assertThat(availableToPromise(paid.skuId())).isEqualTo(8);
        assertThat(reserved(paid.skuId())).isZero();
        assertThat(reservationStatus(paid.sellerOrderId())).isEqualTo("consumed");
        assertThat(ledgerCount("ship", paid.skuId())).isEqualTo(1);
        // 流水的事实单是包裹，不是订单——同一行分两包发时订单 id 会撞键
        assertThat(jdbc.queryForObject(
                        "SELECT ref_type FROM inventory.stock_ledger WHERE type = 'ship' AND sku_id = ?",
                        String.class,
                        paid.skuId()))
                .isEqualTo("package");

        // 退货：商家签收退货那一刻入库，实物 +2、可售 +2
        returnGoods(paid, packageId);
        assertThat(onHand(paid.skuId())).isEqualTo(10);
        assertThat(availableToPromise(paid.skuId())).isEqualTo(10);
        assertThat(ledgerCount("restock", paid.skuId())).isEqualTo(1);
    }

    /**
     * 退货退款要寄回：签收退货之后才回补，不是退款成功那一刻。
     *
     * <p>这两步之间隔着一段物流。挂在退款上，超时兜底那条路（货还没寄到就自动退款）
     * 会给一批不存在的货记账。
     *
     * <p>两个场景用两张订单：整单退完之后订单变成 {@code refunded}，那一行再申请售后会被
     * 「订单行不存在」挡掉——这是对的，但会把这个用例要验的事搅在一起。
     */
    @Test
    void 退货退款_签收退货才回补_仅退款不回补() {
        // 仅退款：货从没离开过商家，不入库
        Paid refundOnlyOrder = placePaidOrder(1);
        ship(refundOnlyOrder, 1);
        assertThat(onHand(refundOnlyOrder.skuId())).isEqualTo(9);

        CaseView refundOnly = rma.apply(new RmaCommand.ApplyRequest(
                refundOnlyOrder.buyerId(),
                refundOnlyOrder.sellerOrderId(),
                "REFUND_ONLY",
                "QUALITY",
                List.of(new RmaCommand.ApplyRequest.Line(1, 1))));
        rma.approve(refundOnly.id(), refundOnlyOrder.merchantId(), Set.of(refundOnlyOrder.shopId()));
        assertThat(onHand(refundOnlyOrder.skuId())).isEqualTo(9);
        assertThat(ledgerCount("restock", refundOnlyOrder.skuId())).isZero();

        // 退货退款：寄回前不回补，商家签收那一刻才回补
        Paid returnOrder = placePaidOrder(3);
        UUID packageId = ship(returnOrder, 3);
        assertThat(onHand(returnOrder.skuId())).isEqualTo(7);

        CaseView returnRefund = rma.apply(new RmaCommand.ApplyRequest(
                returnOrder.buyerId(),
                returnOrder.sellerOrderId(),
                "RETURN_REFUND",
                "QUALITY",
                List.of(new RmaCommand.ApplyRequest.Line(1, 2))));
        rma.approve(returnRefund.id(), returnOrder.merchantId(), Set.of(returnOrder.shopId()));
        rma.shipBack(returnRefund.id(), returnOrder.buyerId(), "sf", "SF" + Ids.newId());
        assertThat(onHand(returnOrder.skuId())).isEqualTo(7);
        assertThat(ledgerCount("restock", returnOrder.skuId())).isZero();

        rma.receive(returnRefund.id(), returnOrder.merchantId(), Set.of(returnOrder.shopId()));
        assertThat(onHand(returnOrder.skuId())).isEqualTo(9);
        assertThat(availableToPromise(returnOrder.skuId())).isEqualTo(9);
        assertThat(packageId).isNotNull();
    }

    /**
     * 一个子单分两个包裹发：两个包裹各扣一次，最后一包才把预占耗完。
     *
     * <p>守的是「幂等锚点是包裹不是订单」。用订单当锚点，第二个包裹会被当成重复请求吞掉——
     * 货发出去了，账上还挂着两件预占，实物永远是错的。
     */
    @Test
    void 分两包发货_两个包裹各扣一次() {
        Paid paid = placePaidOrder(3);

        UUID first = ship(paid, 2);
        assertThat(onHand(paid.skuId())).isEqualTo(8);
        assertThat(reserved(paid.skuId())).isEqualTo(1);
        assertThat(first).isNotNull();

        UUID second = ship(paid, 1);
        assertThat(onHand(paid.skuId())).isEqualTo(7);
        assertThat(reserved(paid.skuId())).isZero();
        assertThat(reservationStatus(paid.sellerOrderId())).isEqualTo("consumed");
        assertThat(second).isNotNull();
        assertThat(ledgerCount("ship", paid.skuId())).isEqualTo(2);
    }

    // —— 链路 ——

    private record Paid(
            UUID buyerId, UUID orderGroupId, UUID sellerOrderId, UUID merchantId, UUID shopId, UUID skuId) {}

    private UUID ship(Paid paid, int quantity) {
        FulfillmentCommand.ShippedPackage shipped = fulfillment.ship(new FulfillmentCommand.ShipRequest(
                paid.sellerOrderId(),
                paid.merchantId(),
                Set.of(paid.shopId()),
                "sf",
                "SF" + Ids.newId(),
                List.of(new FulfillmentCommand.ShipItem(1, quantity))));
        return shipped.packageId();
    }

    /**
     * 走完一次退货退款并签收。
     *
     * <p>不额外把包裹置 delivered：售后的前置条件只有「订单已付款」，而
     * {@code ck_package_delivered_pairing} 要求 {@code delivered_source} 与状态成对出现，
     * 手写 UPDATE 绕不过它——真要签收就走 {@code fulfillment.deliver}，那是同一条写路径。
     */
    private void returnGoods(Paid paid, UUID packageId) {
        CaseView caseView = rma.apply(new RmaCommand.ApplyRequest(
                paid.buyerId(),
                paid.sellerOrderId(),
                "RETURN_REFUND",
                "QUALITY",
                List.of(new RmaCommand.ApplyRequest.Line(1, 2))));
        rma.approve(caseView.id(), paid.merchantId(), Set.of(paid.shopId()));
        rma.shipBack(caseView.id(), paid.buyerId(), "sf", "SF" + Ids.newId());
        rma.receive(caseView.id(), paid.merchantId(), Set.of(paid.shopId()));
        assertThat(packageId).isNotNull();
    }

    private Paid placePaidOrder(int quantity) {
        UUID buyer = UUID.randomUUID();
        AddressView address = addresses.create(buyer, addressRequest());
        Seed goods = seedSellable(1_500, 10);

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
        UUID shopId =
                jdbc.queryForObject("SELECT shop_id FROM trade.seller_order WHERE id = ?", UUID.class, sellerOrderId);
        return new Paid(buyer, placed.orderGroupId(), sellerOrderId, goods.merchantId(), shopId, goods.skuId());
    }

    private void awaitPaid(UUID orderGroupId) {
        for (int i = 0; i < 100; i++) {
            if ("paid"
                    .equals(jdbc.queryForObject(
                            "SELECT payment_status FROM trade.order_group WHERE id = ?", String.class, orderGroupId))) {
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

    // —— 点查 ——

    private int onHand(UUID sku) {
        return jdbc.queryForObject(
                "SELECT on_hand FROM inventory.stock WHERE sku_id = ? AND warehouse_id = ?",
                Integer.class,
                sku,
                WAREHOUSE);
    }

    private int availableToPromise(UUID sku) {
        return jdbc.queryForObject(
                "SELECT available_to_promise FROM inventory.stock WHERE sku_id = ? AND warehouse_id = ?",
                Integer.class,
                sku,
                WAREHOUSE);
    }

    private int reserved(UUID sku) {
        return jdbc.queryForObject(
                "SELECT reserved FROM inventory.stock WHERE sku_id = ? AND warehouse_id = ?",
                Integer.class,
                sku,
                WAREHOUSE);
    }

    private String reservationStatus(UUID sellerOrderId) {
        return jdbc.queryForObject(
                "SELECT status FROM inventory.reservation WHERE seller_order_id = ? AND line_no = 1",
                String.class,
                sellerOrderId);
    }

    private int ledgerCount(String type, UUID sku) {
        return jdbc.queryForObject(
                "SELECT count(*) FROM inventory.stock_ledger WHERE type = ? AND sku_id = ?", Integer.class, type, sku);
    }

    // —— 种子 ——

    private record Seed(UUID skuId, UUID merchantId) {}

    private static AddressRequest addressRequest() {
        return new AddressRequest("张三", "13800000000", "440305", "广东省", "深圳市", "南山区", "科技园路 1 号 2 栋 301", null, null);
    }

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
}
