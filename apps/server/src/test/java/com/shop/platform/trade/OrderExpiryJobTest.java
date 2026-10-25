package com.shop.platform.trade;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.common.id.Ids;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.pricing.dto.QuoteResponse;
import com.shop.platform.pricing.service.PriceQuoteService;
import com.shop.platform.trade.api.PlaceOrderRequest;
import com.shop.platform.trade.api.TradeCommand;
import com.shop.platform.trade.service.OrderExpiryJob;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 超时关单任务：过期未付单被关（组 + 子单）、预占释放回库存；5 分钟宽限内的不碰，
 * 终态单重复执行影响 0 行——与支付回调用同一个前置条件，谁改到行谁赢。
 */
@SpringBootTest
@ActiveProfiles("test")
class OrderExpiryJobTest {

    private static final UUID WAREHOUSE = new UUID(0L, 0L);

    @Autowired
    private TradeCommand orders;

    @Autowired
    private PriceQuoteService quotes;

    @Autowired
    private AddressService addresses;

    @Autowired
    private OrderExpiryJob expiryJob;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void 超时未付单被关_预占回放_宽限内与重复执行都不动() {
        UUID buyer = UUID.randomUUID();
        AddressView address = addresses.create(buyer, addressRequest("张三"));
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
        assertThat(availableOf(goods.skuId())).isEqualTo(9);

        // 宽限窗口内（过期 3 分钟）：第 29 分付款、回调还在路上的那单，不该被抢先处决
        ageTo(placed.orderGroupId(), 3);
        expiryJob.runNow();
        assertThat(closedAtOf(placed.orderGroupId())).isNull();
        assertThat(availableOf(goods.skuId())).isEqualTo(9);

        // 过了宽限（过期 10 分钟）：关组、关子单、库存回来
        ageTo(placed.orderGroupId(), 10);
        expiryJob.runNow();

        assertThat(closedAtOf(placed.orderGroupId())).isNotNull();
        assertThat(jdbc.queryForObject(
                        "SELECT close_reason FROM trade.order_group WHERE id = ?", String.class, placed.orderGroupId()))
                .isEqualTo("timeout");
        Integer closedSellerOrders = jdbc.queryForObject(
                "SELECT count(*) FROM trade.seller_order WHERE group_id = ? AND closed_at IS NOT NULL",
                Integer.class,
                placed.orderGroupId());
        assertThat(closedSellerOrders).isEqualTo(1);
        assertThat(availableOf(goods.skuId())).isEqualTo(10);

        // 已终态：再跑影响 0 行（前置条件不再成立），库存不会多放
        expiryJob.runNow();
        assertThat(availableOf(goods.skuId())).isEqualTo(10);
    }

    // —— 断言与种子 ——

    private int availableOf(UUID skuId) {
        return jdbc.queryForObject(
                "SELECT available FROM inventory.stock WHERE sku_id = ? AND warehouse_id = ?",
                Integer.class,
                skuId,
                WAREHOUSE);
    }

    private java.time.Instant closedAtOf(UUID groupId) {
        return jdbc.queryForObject(
                "SELECT closed_at FROM trade.order_group WHERE id = ?", java.time.Instant.class, groupId);
    }

    /** 把单据年龄改到「已过期 n 分钟」，n > 5 才会被扫描捞到。 */
    private void ageTo(UUID groupId, long minutesPastExpiry) {
        jdbc.update(
                "UPDATE trade.order_group SET expire_at = now() - make_interval(mins => ?) WHERE id = ?",
                (int) minutesPastExpiry,
                groupId);
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
        return new Seed(skuId);
    }

    private static AddressRequest addressRequest(String receiver) {
        return new AddressRequest(
                receiver, "13800000000", "440305", "广东省", "深圳市", "南山区", "科技园路 1 号 2 栋 301", null, null);
    }
}
