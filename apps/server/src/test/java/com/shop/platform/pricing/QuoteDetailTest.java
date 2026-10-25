package com.shop.platform.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.pricing.api.PricingQuery.QuoteSnapshot;
import com.shop.platform.pricing.api.PricingRequest;
import com.shop.platform.pricing.dto.QuoteResponse;
import com.shop.platform.pricing.service.PriceQuoteService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 报价响应的明细与失效行：确认页一屏的金额事实来自这一份。
 *
 * <p>四条钉死：按店铺分组且与证据表一致、失效行不进证据也不进指纹、
 * 指纹拦得住「下单混入失效行」、全失效不出报价。
 */
@SpringBootTest
@ActiveProfiles("test")
class QuoteDetailTest {

    @Autowired
    private PriceQuoteService quotes;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void 按店铺分组出明细_与证据表一致() {
        Seed shop1 = seedSellableShop("一号店", 1_000);
        Seed shop2 = seedSellableShop("二号店", 2_000);

        QuoteResponse response =
                quotes.quote(request(UUID.randomUUID(), List.of(line(1, shop1.skuId(), 1), line(2, shop2.skuId(), 2))));

        assertThat(response.quoteId()).isNotNull();
        assertThat(response.expiresAt()).isAfter(java.time.Instant.now());
        // 1000×1 + 2000×2，无优惠；运费按件：1 件 800，2 件 800+200
        assertThat(response.goods().amount()).isEqualTo(5_000);
        assertThat(response.shipping().amount()).isEqualTo(1_800);
        assertThat(response.payableAmount().amount()).isEqualTo(6_800);

        assertThat(response.groups()).hasSize(2);
        QuoteResponse.Group first = response.groups().get(0);
        assertThat(first.shopName()).isEqualTo("一号店");
        assertThat(first.shipping().amount()).isEqualTo(800);
        assertThat(first.lines()).hasSize(1);
        QuoteResponse.Line line = first.lines().getFirst();
        assertThat(line.unitAmount().amount()).isEqualTo(1_000);
        assertThat(line.subtotal().amount()).isEqualTo(1_000);
        assertThat(line.payableAmount().amount()).isEqualTo(1_000);
        assertThat(line.title()).isEqualTo("测试商品");

        QuoteResponse.Group second = response.groups().get(1);
        assertThat(second.shopName()).isEqualTo("二号店");
        assertThat(second.shipping().amount()).isEqualTo(1_000);
        assertThat(second.lines().getFirst().quantity()).isEqualTo(2);

        // 证据表与响应同源：两行证据，金额逐行对得上
        Integer evidenceLines = jdbc.queryForObject(
                "SELECT count(*) FROM pricing.price_quote_line WHERE quote_id = ?" + " AND line_no IN (1, 2)",
                Integer.class,
                response.quoteId());
        assertThat(evidenceLines).isEqualTo(2);
    }

    @Test
    void 失效行进列表_不进证据也不进指纹() {
        UUID buyer = UUID.randomUUID();
        Seed alive = seedSellableShop("存活店", 1_500);
        Seed dead = seedSellableShop("下架店", 900);
        jdbc.update("UPDATE catalog.listing SET status = 'offline' WHERE id = ?", dead.listingId());

        QuoteResponse response =
                quotes.quote(request(buyer, List.of(line(1, alive.skuId(), 1), line(2, dead.skuId(), 1))));

        assertThat(response.unavailable()).hasSize(1);
        assertThat(response.unavailable().getFirst().lineNo()).isEqualTo(2);
        assertThat(response.unavailable().getFirst().skuId()).isEqualTo(dead.skuId());
        assertThat(response.unavailable().getFirst().cause()).isEqualTo("UNAVAILABLE");
        assertThat(response.groups()).hasSize(1);
        assertThat(response.goods().amount()).isEqualTo(1_500);

        Integer evidenceLines = jdbc.queryForObject(
                "SELECT count(*) FROM pricing.price_quote_line WHERE quote_id = ?", Integer.class, response.quoteId());
        assertThat(evidenceLines).isEqualTo(1);

        // 指纹只认可售行：混着失效行去核销 → PRICE_CHANGED；剔除后 → 核销成功
        assertThatThrownBy(() -> quotes.consumeForOrder(
                        response.quoteId(),
                        request(buyer, List.of(line(1, alive.skuId(), 1), line(2, dead.skuId(), 1)))))
                .isInstanceOfSatisfying(
                        BusinessException.class, e -> assertThat(e.getDetail()).contains("重新确认"));

        QuoteSnapshot consumed =
                quotes.consumeForOrder(response.quoteId(), request(buyer, List.of(line(1, alive.skuId(), 1))));
        assertThat(consumed.lines()).hasSize(1);
        assertThat(consumed.payableAmount().amount()).isEqualTo(1_500 + 800);
    }

    @Test
    void 挂售变化也是失效行_带LISTING_CHANGED原因() {
        Seed alive = seedSellableShop("邻店", 1_000);
        Seed swapped = seedSellableShop("掉包店", 1_200);

        QuoteResponse response = quotes.quote(new PricingRequest(
                UUID.randomUUID(),
                address(),
                List.of(
                        PricingRequest.Line.of(1, alive.skuId(), 1),
                        // 用户看到的 listing 已被换挂：校验位对不上
                        new PricingRequest.Line(2, UUID.randomUUID(), swapped.skuId(), null, 1)),
                List.of()));

        assertThat(response.unavailable()).singleElement().satisfies(line -> {
            assertThat(line.cause()).isEqualTo("LISTING_CHANGED");
            assertThat(line.skuId()).isEqualTo(swapped.skuId());
        });
        assertThat(response.groups()).hasSize(1);
    }

    @Test
    void 全部失效不出报价() {
        UUID deadSku = seedSellableShop("全下架店", 900).skuId();
        jdbc.update("UPDATE catalog.sku SET status = 'disabled' WHERE id = ?", deadSku);

        assertThatThrownBy(() -> quotes.quote(request(UUID.randomUUID(), List.of(line(1, deadSku, 1)))))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(409));
    }

    // —— 种子 ——

    private record Seed(UUID skuId, UUID listingId, UUID shopId) {}

    /** 一家店一个在售 SKU：类目 → SPU → SKU → online listing → 店 → 运费模板（默认区 1 件 800、续件 200） */
    private Seed seedSellableShop(String shopName, long price) {
        UUID categoryId = Ids.newId();
        jdbc.update(
                "INSERT INTO catalog.category (id, path, level, code, name) VALUES (?, ?, 3, ?, ?)",
                categoryId,
                "/" + Ids.newId() + "/" + Ids.newId() + "/" + categoryId + "/",
                "C" + categoryId,
                shopName);
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
        jdbc.update("INSERT INTO seller.shop (id, merchant_id, name) VALUES (?, ?, ?)", shopId, merchantId, shopName);
        UUID listingId = Ids.newId();
        jdbc.update(
                "INSERT INTO catalog.listing (id, spu_id, merchant_id, shop_id, status) VALUES (?, ?, ?, ?, 'online')",
                listingId,
                spuId,
                merchantId,
                shopId);
        jdbc.update(
                "INSERT INTO seller.shipping_template (id, shop_id, name, charge_by, regions, status)"
                        + " VALUES (?, ?, ?, 'piece', ?::jsonb, 'active')",
                Ids.newId(),
                shopId,
                shopName + "运费",
                "[{\"areaCodes\": [], \"first\": 1, \"firstFee\": 800, \"additional\": 1, \"additionalFee\": 200}]");
        return new Seed(skuId, listingId, shopId);
    }

    private static PricingRequest.Address address() {
        return new PricingRequest.Address("44", "4403", "440305");
    }

    private static PricingRequest request(UUID buyer, List<PricingRequest.Line> lines) {
        return new PricingRequest(buyer, address(), lines, List.of());
    }

    private static PricingRequest.Line line(int lineNo, UUID skuId, int quantity) {
        return PricingRequest.Line.of(lineNo, skuId, quantity);
    }
}
