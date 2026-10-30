package com.shop.platform.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.catalog.mapper.ListingMapper;
import com.shop.platform.catalog.service.ShopClosedListener;
import com.shop.platform.common.id.Ids;
import com.shop.platform.seller.events.ShopClosed;
import com.shop.platform.testsupport.IntegrationTest;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 关店级联：ShopClosed 事件把这家店所有在线 listing 打下线，别家的不动。
 *
 * <p>listing 直接用 SQL 插最小行——级联只看 (shop_id, status)，spu 的完整形状与它无关。
 */
class ShopClosedCascadeTest extends IntegrationTest {

    @Autowired
    private ShopClosedListener listener;

    @Autowired
    private ListingMapper listings;

    private UUID merchantId;
    private UUID shopId;
    private UUID listingId;

    /** 测试库重建后没有种子类目，给 spu 的 NOT NULL category_id 造一个一级类目。 */
    private UUID anyCategory() {
        UUID id = Ids.newId();
        jdbc.update(
                "INSERT INTO catalog.category (id, path, level, code, name) VALUES (?, ?, 1, ?, '关店级联测试')",
                id,
                "/" + id + "/",
                "cascade-cat-" + id.toString().substring(30));
        return id;
    }

    private void givenOnlineListing() {
        merchantId = Ids.newId();
        shopId = Ids.newId();
        listingId = Ids.newId();
        UUID spuId = Ids.newId();
        UUID categoryId = anyCategory();
        jdbc.update(
                "INSERT INTO catalog.spu (id, merchant_id, category_id, title) VALUES (?, ?, ?, ?)",
                spuId,
                merchantId,
                categoryId,
                "cascade-test-" + listingId);
        jdbc.update(
                "INSERT INTO catalog.listing (id, spu_id, merchant_id, shop_id, status)"
                        + " VALUES (?, ?, ?, ?, 'online')",
                listingId,
                spuId,
                merchantId,
                shopId);
    }

    @Test
    void 关店把自家在线商品下架() {
        givenOnlineListing();

        listener.on(new ShopClosed(Ids.newId(), merchantId, shopId, merchantId, Instant.now()));

        assertThat(eventually(() -> "offline"
                        .equals(jdbc.queryForObject(
                                "SELECT status FROM catalog.listing WHERE id = ?", String.class, listingId))))
                .isTrue();
    }

    @Test
    void 事件重投不重复消费() {
        givenOnlineListing();
        UUID eventId = Ids.newId();

        listener.on(new ShopClosed(eventId, merchantId, shopId, merchantId, Instant.now()));
        // 等第一次级联落库后再翻回 online，避免与异步消费竞态
        assertThat(eventually(() -> "offline"
                        .equals(jdbc.queryForObject(
                                "SELECT status FROM catalog.listing WHERE id = ?", String.class, listingId))))
                .isTrue();
        jdbc.update("UPDATE catalog.listing SET status = 'online' WHERE id = ?", listingId);
        listener.on(new ShopClosed(eventId, merchantId, shopId, merchantId, Instant.now()));

        // 同一 eventId 第二次进来被 inbox 挡掉，listing 保持刚改回的 online
        try {
            Thread.sleep(200);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        assertThat(jdbc.queryForObject("SELECT status FROM catalog.listing WHERE id = ?", String.class, listingId))
                .isEqualTo("online");
    }

    @Test
    void 只下架本店的商品() {
        givenOnlineListing();
        UUID otherShopListing = Ids.newId();
        UUID otherShopId = Ids.newId();
        UUID otherSpu = Ids.newId();
        UUID categoryId = anyCategory();
        jdbc.update(
                "INSERT INTO catalog.spu (id, merchant_id, category_id, title) VALUES (?, ?, ?, 'cascade-test-other')",
                otherSpu,
                merchantId,
                categoryId);
        jdbc.update(
                "INSERT INTO catalog.listing (id, spu_id, merchant_id, shop_id, status)"
                        + " VALUES (?, ?, ?, ?, 'online')",
                otherShopListing,
                otherSpu,
                merchantId,
                otherShopId);

        listener.on(new ShopClosed(Ids.newId(), merchantId, shopId, merchantId, Instant.now()));

        assertThat(eventually(() -> listings.findOnlineByShop(shopId).isEmpty()))
                .isTrue();
        assertThat(jdbc.queryForObject(
                        "SELECT status FROM catalog.listing WHERE id = ?", String.class, otherShopListing))
                .isEqualTo("online");
    }

    /** 监听器经 Modulith 异步执行（直调代理也是异步），断言轮询等待落库。 */
    private static boolean eventually(java.util.function.Supplier<Boolean> probe) {
        for (int i = 0; i < 100; i++) {
            if (Boolean.TRUE.equals(probe.get())) {
                return true;
            }
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }
}
