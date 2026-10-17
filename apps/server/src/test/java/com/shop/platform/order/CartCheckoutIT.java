package com.shop.platform.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.shop.platform.common.Money;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 下单清购物车集成验证（真库）：cart 监听 order 的 OrderPlacedEvent，在订单创建事务内同步按 userId + skuId
 * 删除被购条目（订单在，条目必不在），这是「只有真库能证明」的跨模块一致性——mock 掉 cart 模块时整条链路是假的。
 * 同时钉死缺货归因（STOCK_SHORTAGE）与真实库存投影的一致性。
 */
@SpringBootTest
class CartCheckoutIT extends IntegrationTestSupport {

    @Autowired
    private com.shop.platform.order.service.OrderService orderService;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID addressId;

    /** 直插购物车条目，返回条目 id */
    private UUID seedCartItem(UUID skuId, int quantity) {
        UUID itemId = UUID.randomUUID();
        jdbc.update(
                """
                INSERT INTO cart.items (id, user_id, sku_id, quantity, selected)
                VALUES (?::uuid, ?::uuid, ?::uuid, ?, TRUE)
                """,
                itemId.toString(),
                userId.toString(),
                skuId.toString(),
                quantity);
        db.onDelete("DELETE FROM cart.items WHERE id = ?::uuid", itemId.toString());
        return itemId;
    }

    private void registerOrderCleanup() {
        // 与 OrderFlowIT 同款兜底圈删：service 产生的单据/流水/事件登记按 userId 清
        db.seedActiveUser(userId);
        db.onDeleteBuyerOrderChain(userId);
        addressId = db.seedAddress(userId);
    }

    private int cartCount() {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM cart.items WHERE user_id = ?::uuid", Integer.class, userId.toString());
        assertNotNull(count);
        return count;
    }

    private static List<OrderLineRequest> lines(UUID skuId, int quantity) {
        return List.of(new OrderLineRequest(skuId, quantity));
    }

    @Test
    void 下单后车里同款SKU条目同步清除_未买的保留() {
        UUID sellableSku = db.seedOnSaleSku(shopId, 1000L, 5);
        registerOrderCleanup();
        UUID bought = seedCartItem(sellableSku, 2);
        UUID kept = seedCartItem(db.seedOnSaleSku(shopId, 500L, 9), 1);

        var created = orderService.create(
                userId, new CreateOrderRequest(UUID.randomUUID(), addressId, lines(sellableSku, 2), null, null));

        // 一单一行：只买了这一个 SKU
        assertEquals(1, created.orders().size());
        assertEquals(1, cartCount()); // 同款 SKU 的条目已随事务删除，未买的保留

        Integer remaining = jdbc.queryForObject(
                "SELECT count(*) FROM cart.items WHERE id = ?::uuid", Integer.class, kept.toString());
        assertEquals(1, remaining);
        assertEquals(
                0,
                jdbc.queryForObject(
                        "SELECT count(*) FROM cart.items WHERE id = ?::uuid", Integer.class, bought.toString()));
    }

    @Test
    void 预览_缺货行归因STOCK_SHORTAGE_有效行进分组() {
        UUID ok = db.seedOnSaleSku(shopId, 1000L, 5);
        UUID shortage = db.seedOnSaleSku(shopId, 300L, 1); // 库存 1，要买 2 → 缺货
        registerOrderCleanup();

        var preview = orderService.preview(
                userId,
                new PreviewOrderRequest(
                        addressId, List.of(new OrderLineRequest(ok, 2), new OrderLineRequest(shortage, 2)), null));

        // 有效行一组：金额 = 1000×2；运费 V1 恒 0
        assertEquals(1, preview.groups().size());
        assertEquals(Money.cny(2000), preview.groups().getFirst().itemAmount());
        // 缺货行置灰并正确归因（真实库存投影判定）
        assertEquals(1, preview.unavailable().size());
        assertEquals(
                com.shop.platform.order.service.CheckoutPreview.UnavailableLine.CAUSE_STOCK_SHORTAGE,
                preview.unavailable().getFirst().cause());
        assertEquals(Money.cny(2000), preview.totalPayAmount());
    }
}
