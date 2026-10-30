package com.shop.platform.cart;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.cart.service.CartService;
import com.shop.platform.cart.service.OrderGroupPlacedHandler;
import com.shop.platform.common.id.Ids;
import com.shop.platform.testsupport.IntegrationTest;
import com.shop.platform.trade.events.OrderGroupPlaced;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * 下单清车：落单事件删掉本人被买下的条目，别人的车里同款照留；事件重投靠 inbox 去重。
 * 直接调 handler——{@code @ApplicationModuleListener} 自带 @Async，异步落地靠轮询等
 * （与 ShipDeadlineJobTest 的 awaitShipTask 同一形态）。
 */
class OrderGroupPlacedHandlerTest extends IntegrationTest {

    @Autowired
    private OrderGroupPlacedHandler handler;

    @Autowired
    private CartService cart;

    @Autowired
    private JdbcClient jdbc;

    @Test
    void 下单清车只删本人被买下的条目() {
        UUID buyer = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();
        UUID bought = Ids.newId();
        UUID keep = Ids.newId();
        insertItem(buyer, bought);
        insertItem(buyer, keep);
        insertItem(stranger, bought);

        handler.on(new OrderGroupPlaced(Ids.newId(), Ids.newId(), buyer, List.of(bought), Instant.now()));

        awaitCount(buyer, 1);
        assertThat(cart.list(buyer).lines().stream().map(l -> l.skuId())).containsExactly(keep);
        // 别人车里同款是别人还没买走的意图，照留
        awaitCount(stranger, 1);
        assertThat(cart.list(stranger).lines().stream().map(l -> l.skuId())).containsExactly(bought);
    }

    @Test
    void 事件重投靠inbox去重_不误删后加回的条目() {
        UUID buyer = UUID.randomUUID();
        UUID sku = Ids.newId();
        UUID eventId = Ids.newId();
        insertItem(buyer, sku);

        handler.on(new OrderGroupPlaced(eventId, Ids.newId(), buyer, List.of(sku), Instant.now()));
        awaitCount(buyer, 0);

        // 同一个事件再投一次（outbox 重试）：闸门挡住，不会把后来加购的同款再删一遍
        insertItem(buyer, sku);
        handler.on(new OrderGroupPlaced(eventId, Ids.newId(), buyer, List.of(sku), Instant.now()));
        awaitCount(buyer, 1);
    }

    /** 清车是 OrderGroupPlaced 的异步监听，轮询等它落库 */
    private void awaitCount(UUID buyer, long expected) {
        for (int i = 0; i < 100; i++) {
            if (cart.count(buyer).total() == expected) {
                return;
            }
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
        }
        throw new AssertionError("清车没有在时限内落库: buyer=" + buyer + " expected=" + expected);
    }

    private void insertItem(UUID buyerId, UUID skuId) {
        jdbc.sql("INSERT INTO cart.items (id, buyer_id, sku_id, quantity) VALUES (?, ?, ?, 1)")
                .param(Ids.newId())
                .param(buyerId)
                .param(skuId)
                .update();
    }
}
