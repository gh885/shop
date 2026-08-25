package com.shop.platform.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.shop.platform.common.Money;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 购物车模式结算集成验证（真库）：CartCheckedOutEvent 监听在订单创建事务内同步删除被购条目
 * （订单在，条目必不在），这是「只有真库能证明」的跨模块一致性——mock 掉 cart 模块时整条链路是假的。
 * 同时钉死缺货归因（STOCK_SHORTAGE）与真实库存投影的一致性。
 */
@SpringBootTest
class CartCheckoutIT extends IntegrationTestSupport {

    @Autowired
    private com.shop.platform.order.service.OrderService orderService;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private final UUID addressId = UUID.randomUUID();

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
        db.onDelete("DELETE FROM payment.payments WHERE user_id = ?::uuid", userId.toString());
        db.onDelete(
                "DELETE FROM orders.items WHERE order_id IN (SELECT id FROM orders.orders WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete("DELETE FROM orders.orders WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM kernel.event_publication WHERE serialized_event LIKE ?", "%" + userId + "%");
        jdbc.update(
                "INSERT INTO user_profile.addresses (id, user_id, receiver_name, phone, region_code, province, city, district, detail) "
                        + "VALUES (?::uuid, ?::uuid, '张三', '13800000000', '110100', '北京市', '北京市', '朝阳区', '测试路 1 号')",
                addressId.toString(),
                userId.toString());
        db.onDelete("DELETE FROM user_profile.addresses WHERE id = ?::uuid", addressId.toString());
    }

    private int cartCount() {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM cart.items WHERE user_id = ?::uuid", Integer.class, userId.toString());
        assertNotNull(count);
        return count;
    }

    @Test
    void 结算后购物车条目同步清除_未结算的保留() {
        UUID sellableSku = db.seedOnSaleSku(shopId, 1000L, 5);
        registerOrderCleanup();
        UUID bought = seedCartItem(sellableSku, 2);
        UUID kept = seedCartItem(db.seedOnSaleSku(shopId, 500L, 9), 1);

        var created = orderService.create(
                userId,
                new com.shop.platform.order.dto.CreateOrderRequest(addressId, List.of(bought), null, null, null));

        // 一单一行：只买了勾选的那条
        assertEquals(1, created.size());
        assertEquals(1, cartCount()); // 被购条目已随事务删除，未购的保留

        Integer remaining = jdbc.queryForObject(
                "SELECT count(*) FROM cart.items WHERE id = ?::uuid", Integer.class, kept.toString());
        assertEquals(1, remaining);
        assertEquals(
                0,
                jdbc.queryForObject(
                        "SELECT count(*) FROM cart.items WHERE id = ?::uuid", Integer.class, bought.toString()));
    }

    @Test
    void 预览_缺货行归因STOCK_SHORTAGE_有效行进分组() throws Exception {
        UUID ok = db.seedOnSaleSku(shopId, 1000L, 5);
        UUID shortage = db.seedOnSaleSku(shopId, 300L, 1); // 库存 1，要买 2 → 缺货
        registerOrderCleanup();
        UUID okItem = seedCartItem(ok, 2);
        UUID shortItem = seedCartItem(shortage, 2);

        var preview = orderService.preview(
                userId,
                new com.shop.platform.order.dto.PreviewOrderRequest(addressId, List.of(okItem, shortItem), null, null));

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

    @Test
    void 购物车与立即购买混用参数_400拒绝() {
        UUID skuId = db.seedOnSaleSku(shopId, 1000L, 5);
        registerOrderCleanup();
        UUID item = seedCartItem(skuId, 1);

        assertThatBothModesRejected(item, skuId);
    }

    private void assertThatBothModesRejected(UUID item, UUID skuId) {
        org.junit.jupiter.api.Assertions.assertThrows(
                com.shop.platform.common.BusinessException.class,
                () -> orderService.create(
                        userId,
                        new com.shop.platform.order.dto.CreateOrderRequest(addressId, List.of(item), skuId, 1, null)));
    }
}
