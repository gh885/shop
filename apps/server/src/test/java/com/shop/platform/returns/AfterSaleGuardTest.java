package com.shop.platform.returns;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.pricing.dto.QuoteResponse;
import com.shop.platform.pricing.service.PriceQuoteService;
import com.shop.platform.returns.api.AfterSaleCommand;
import com.shop.platform.returns.api.CaseView;
import com.shop.platform.trade.api.PlaceOrderRequest;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.service.PaymentStarter;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 售后入口的两道闸：终态的单不能被撤销改写历史；未付款的订单没有"退"可言。
 */
@SpringBootTest
@ActiveProfiles("test")
class AfterSaleGuardTest {

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
    private AfterSaleCommand afterSale;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void 被拒的售后单不能被撤销改写() {
        Paid paid = placePaidOrder();
        CaseView caseView = applyRefundOnly(paid);

        afterSale.reject(caseView.id(), paid.merchantId(), "商品没有问题");

        // CAS 只防并发不防非法迁移：不挡的话"被拒"会被改写成"买家撤销"，拒绝记录失真
        assertThatThrownBy(() -> afterSale.cancel(caseView.id(), paid.buyerId()))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(409));
        assertThat(jdbc.queryForObject(
                        "SELECT status FROM returns.after_sale_case WHERE id = ?", String.class, caseView.id()))
                .isEqualTo("rejected");
    }

    @Test
    void 未付款的订单不能申请售后() {
        UUID buyer = UUID.randomUUID();
        UUID orderGroupId = placeOrder(buyer);

        UUID sellerOrderId =
                jdbc.queryForObject("SELECT id FROM trade.seller_order WHERE group_id = ?", UUID.class, orderGroupId);

        // 没付款就想退：404，不是走到冻结那一步炸出 500
        assertThatThrownBy(() -> afterSale.apply(new AfterSaleCommand.ApplyRequest(
                        buyer,
                        sellerOrderId,
                        "REFUND_ONLY",
                        "QUALITY",
                        List.of(new AfterSaleCommand.ApplyRequest.Line(1, 1)))))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(404));

        Integer cases = jdbc.queryForObject(
                "SELECT count(*) FROM returns.after_sale_case WHERE seller_order_id = ?", Integer.class, sellerOrderId);
        assertThat(cases).isZero();
    }

    // —— 场景构造 ——

    private record Paid(UUID buyerId, UUID orderGroupId, UUID sellerOrderId, UUID merchantId) {}

    private CaseView applyRefundOnly(Paid paid) {
        return afterSale.apply(new AfterSaleCommand.ApplyRequest(
                paid.buyerId(),
                paid.sellerOrderId(),
                "REFUND_ONLY",
                "QUALITY",
                List.of(new AfterSaleCommand.ApplyRequest.Line(1, 1))));
    }

    private UUID placeOrder(UUID buyer) {
        AddressView address = addresses.create(buyer, addressRequest());
        Seed goods = seedSellable(1_500);

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
        return placed.orderGroupId();
    }

    private Paid placePaidOrder() {
        UUID buyer = UUID.randomUUID();
        UUID orderGroupId = placeOrder(buyer);
        Seed goods = lastSeed();

        PaymentView view = paymentStarter.start(orderGroupId, buyer);
        paymentService.confirm(view.paymentId(), buyer);
        for (int i = 0; i < 100; i++) {
            String status = jdbc.queryForObject(
                    "SELECT payment_status FROM trade.order_group WHERE id = ?", String.class, orderGroupId);
            if ("paid".equals(status)) {
                break;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
        }
        UUID sellerOrderId =
                jdbc.queryForObject("SELECT id FROM trade.seller_order WHERE group_id = ?", UUID.class, orderGroupId);
        return new Paid(buyer, orderGroupId, sellerOrderId, goods.merchantId());
    }

    // —— 种子（lastSeed 让两条路径共用最近一次种出的商家） ——

    private Seed last;

    private record Seed(UUID skuId, UUID merchantId) {}

    private Seed lastSeed() {
        return last;
    }

    private Seed seedSellable(long price) {
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
                10,
                10);
        last = new Seed(skuId, merchantId);
        return last;
    }

    private static AddressRequest addressRequest() {
        return new AddressRequest("张三", "13800000000", "440305", "广东省", "深圳市", "南山区", "科技园路 1 号 2 栋 301", null, null);
    }
}
