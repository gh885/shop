package com.shop.platform.trade;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.pricing.dto.QuoteResponse;
import com.shop.platform.pricing.service.PriceQuoteService;
import com.shop.platform.trade.api.PlaceOrderRequest;
import com.shop.platform.trade.api.TradeCommand;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 下单地址走 addressId：trade 按 id 向地址簿取快照、校验归属，订单里存的是展开后的完整地址
 * （编码 + 名称），订单不回查地址簿——改地址/删地址不影响历史订单。
 */
@SpringBootTest
@ActiveProfiles("test")
class PlaceOrderAddressTest {

    private static final UUID WAREHOUSE = new UUID(0L, 0L);

    @Autowired
    private TradeCommand orders;

    @Autowired
    private PriceQuoteService quotes;

    @Autowired
    private AddressService addresses;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void 按地址簿id落单_订单存完整快照_库存同步预占() {
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

        assertThat(placed.payableAmount().amount()).isEqualTo(1_500 + 800);

        // 订单组里的地址快照：收件人、区划码、省市区名称都钉进去了，改地址簿也动不了它
        String shippingAddress = jdbc.queryForObject(
                "SELECT shipping_address::text FROM trade.order_group WHERE id = ?",
                String.class,
                placed.orderGroupId());
        assertThat(shippingAddress)
                .contains("\"receiverName\": \"张三\"")
                .contains("\"regionCode\": \"440305\"")
                .contains("\"province\": \"广东省\"")
                .contains("\"phone\": \"13800000000\"");

        // 子单与库存：一商家一子单，预占扣减可用库存
        Integer sellerOrders = jdbc.queryForObject(
                "SELECT count(*) FROM trade.seller_order WHERE group_id = ?", Integer.class, placed.orderGroupId());
        assertThat(sellerOrders).isEqualTo(1);
        Integer available = jdbc.queryForObject(
                "SELECT available_to_promise FROM inventory.stock WHERE sku_id = ? AND warehouse_id = ?",
                Integer.class,
                goods.skuId(),
                WAREHOUSE);
        assertThat(available).isEqualTo(9);

        // 快照独立性：删掉地址簿这条地址，订单快照原样
        addresses.delete(buyer, address.id());
        String afterDelete = jdbc.queryForObject(
                "SELECT shipping_address::text FROM trade.order_group WHERE id = ?",
                String.class,
                placed.orderGroupId());
        assertThat(afterDelete).isEqualTo(shippingAddress);
    }

    @Test
    void 他人地址与不存在的地址都是404() {
        UUID buyer = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();
        AddressView mine = addresses.create(buyer, addressRequest("张三"));
        AddressView theirs = addresses.create(stranger, addressRequest("李四"));
        Seed goods = seedSellable(2_000, 5);

        QuoteResponse quote = quotes.quote(new PricingRequest(
                buyer,
                new PricingRequest.Address("44", "4403", "440305"),
                List.of(PricingRequest.Line.of(1, goods.skuId(), 1)),
                List.of()));

        // 用别人的地址：与"地址不存在"同一句话，不泄露存在性
        assertThatThrownBy(() -> orders.placeOrder(new PlaceOrderRequest(
                        buyer,
                        quote.quoteId(),
                        theirs.id(),
                        List.of(PlaceOrderRequest.Line.of(1, goods.skuId(), null, 1)),
                        null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(404));

        // 随机地址 id：同样 404；且报价单没被白烧（地址解析先于核销）
        assertThatThrownBy(() -> orders.placeOrder(new PlaceOrderRequest(
                        buyer,
                        quote.quoteId(),
                        Ids.newId(),
                        List.of(PlaceOrderRequest.Line.of(1, goods.skuId(), null, 1)),
                        null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(404));

        String status = jdbc.queryForObject(
                "SELECT status FROM pricing.price_quote WHERE id = ?", String.class, quote.quoteId());
        assertThat(status).isEqualTo("issued");

        // 本人的地址照常能下单（同一张报价单）
        TradeCommand.PlacedOrder placed = orders.placeOrder(new PlaceOrderRequest(
                buyer,
                quote.quoteId(),
                mine.id(),
                List.of(PlaceOrderRequest.Line.of(1, goods.skuId(), null, 1)),
                null));
        assertThat(placed.orderGroupId()).isNotNull();
    }

    // —— 种子 ——

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

    private static AddressRequest addressRequest(String receiver) {
        return new AddressRequest(
                receiver, "13800000000", "440305", "广东省", "深圳市", "南山区", "科技园路 1 号 2 栋 301", null, null);
    }
}
