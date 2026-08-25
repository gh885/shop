package com.shop.platform.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.service.CheckoutPreview;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderWithItems;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.product.api.StockCommand;
import com.shop.platform.product.api.StockLine;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 交易关键链路集成验证（真库）：预览 → 下单扣库存 → MOCK 支付推进状态机 → 幂等重付 →
 * 越态取消拒绝 → 超时关单回补库存。测试数据自建自清，不依赖种子数据。
 */
@SpringBootTest
class OrderFlowIntegrationTest {

    @Autowired
    private OrderService orderService;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private StockCommand stockCommand;

    @Autowired
    private JdbcTemplate jdbc;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID productId;

    private UUID skuId;

    private UUID addressId;

    /** 建一个在售 SKU：单价 1000 分，库存 5 */
    private void seedSku(int stock) {
        productId = UUID.randomUUID();
        skuId = UUID.randomUUID();
        addressId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO product.products (id, shop_id, category_id, name, status) VALUES (?::uuid, ?::uuid, ?::uuid, '测试商品', 1)",
                productId.toString(),
                shopId.toString(),
                UUID.randomUUID().toString());
        jdbc.update(
                "INSERT INTO product.skus (id, product_id, name, price, currency, stock, status) VALUES (?::uuid, ?::uuid, '测试SKU', 1000, 'CNY', ?, 1)",
                skuId.toString(),
                productId.toString(),
                stock);
        jdbc.update(
                "INSERT INTO user_profile.addresses (id, user_id, receiver_name, phone, region_code, province, city, district, detail) "
                        + "VALUES (?::uuid, ?::uuid, '张三', '13800000000', '110100', '北京市', '北京市', '朝阳区', '测试路 1 号')",
                addressId.toString(),
                userId.toString());
    }

    @AfterEach
    void cleanup() {
        // 只清自己造的数：按本测试持有的 id 精确删除，跨 schema 各回各家
        jdbc.update(
                "DELETE FROM orders.items WHERE order_id IN (SELECT id FROM orders.orders WHERE user_id = ?::uuid)",
                userId.toString());
        jdbc.update("DELETE FROM orders.orders WHERE user_id = ?::uuid", userId.toString());
        jdbc.update("DELETE FROM payment.payments WHERE user_id = ?::uuid", userId.toString());
        if (skuId != null) {
            jdbc.update("DELETE FROM product.skus WHERE product_id = ?::uuid", productId.toString());
            jdbc.update("DELETE FROM product.products WHERE id = ?::uuid", productId.toString());
        }
        if (addressId != null) {
            jdbc.update("DELETE FROM user_profile.addresses WHERE id = ?::uuid", addressId.toString());
        }
    }

    private Integer stockOf() {
        return jdbc.queryForObject(
                "SELECT stock FROM product.skus WHERE id = ?::uuid", Integer.class, skuId.toString());
    }

    private String statusOf(UUID orderId) {
        return jdbc.queryForObject(
                "SELECT status FROM orders.orders WHERE id = ?::uuid", String.class, orderId.toString());
    }

    private CreateOrderRequest buyNow(int quantity) {
        return new CreateOrderRequest(addressId, null, skuId, quantity, null);
    }

    @Test
    void fullFlow_createDeductStock_payThenIdempotent_cancelRejectedAfterPaid() {
        seedSku(5);

        // 1. 预览：一组一行，应付 = 1000 × 2
        CheckoutPreview preview = orderService.preview(userId, new PreviewOrderRequest(null, null, skuId, 2));
        assertEquals(1, preview.groups().size());
        assertEquals(0, preview.unavailable().size());
        assertEquals(2000L, preview.totalPayAmount().amount());

        // 2. 下单：拆一单、行快照落库、库存 5 → 3（同事务同步调用扣减）
        List<Order> created = orderService.create(userId, buyNow(2));
        assertEquals(1, created.size());
        Order order = created.getFirst();
        assertEquals(Order.STATUS_PENDING_PAYMENT, order.getStatus());
        assertEquals(2000L, order.getPayAmount());
        assertNotNull(order.getPayExpireAt());
        assertEquals(3, stockOf());

        // 3. 支付：流水落库且订单推进到 PAID（同事务同步调用链）
        Payment paid = paymentService.pay(userId, order.getId());
        assertEquals(Payment.STATUS_SUCCESS, paid.getStatus());
        assertEquals(Order.STATUS_PAID, statusOf(order.getId()));

        // 4. 幂等重付：返回同一笔成功流水，订单状态不变
        Payment again = paymentService.pay(userId, order.getId());
        assertEquals(paid.getId(), again.getId());
        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT count(*) FROM payment.payments WHERE order_id = ?::uuid",
                        Integer.class,
                        order.getId().toString()));

        // 5. 已付款（待发货）仍可取消：库存回补；重复取消被状态闸门拒绝
        orderService.cancel(userId, order.getId(), "不想买了");
        assertEquals(Order.STATUS_CANCELLED, statusOf(order.getId()));
        assertEquals(5, stockOf());

        BusinessException ex =
                assertThrows(BusinessException.class, () -> orderService.cancel(userId, order.getId(), "再试一次"));
        assertEquals(409, ex.getHttpStatus());
    }

    /** 请求行库存不足在 resolve 前置拦截（400），与预览同一道判定；订单零残留 */
    @Test
    void create_insufficientStock_rejectedUpfront_noResidue() {
        seedSku(5);

        BusinessException ex = assertThrows(BusinessException.class, () -> orderService.create(userId, buyNow(999)));
        assertEquals(400, ex.getHttpStatus());

        assertEquals(
                0,
                jdbc.queryForObject(
                        "SELECT count(*) FROM orders.orders WHERE user_id = ?::uuid",
                        Integer.class,
                        userId.toString()));
        assertEquals(5, stockOf());
    }

    /** 并发窗口兑底：预览时充足、扣减时被抢空 → 条件更新影响行数 0 → StockCommand 抛 INSUFFICIENT_STOCK(409) */
    @Test
    void stockCommand_raceWindowShortage_conflictWithCode() {
        seedSku(5);

        BusinessException ex =
                assertThrows(BusinessException.class, () -> stockCommand.deduct(List.of(new StockLine(skuId, 999))));
        assertEquals(409, ex.getHttpStatus());
        assertEquals("INSUFFICIENT_STOCK", ex.getCode());
    }

    @Test
    void closeExpired_restoresStock_andMarksCancelled() throws Exception {
        seedSku(5);

        List<Order> created = orderService.create(userId, buyNow(1));
        UUID orderId = created.getFirst().getId();
        assertEquals(4, stockOf());

        // 把付款截止时刻拨到过去，模拟超时
        jdbc.update(
                "UPDATE orders.orders SET pay_expire_at = ? WHERE id = ?::uuid",
                Timestamp.from(OffsetDateTime.now().minusSeconds(1).toInstant()),
                orderId.toString());

        int closed = orderService.closeExpired();
        assertTrue(closed >= 1);
        assertEquals(Order.STATUS_CANCELLED, statusOf(orderId));
        assertEquals(5, stockOf()); // 库存已回补

        // 关单后再支付被拒：订单不是待付款状态
        BusinessException ex = assertThrows(BusinessException.class, () -> paymentService.pay(userId, orderId));
        assertEquals(409, ex.getHttpStatus());
    }

    @Test
    void pageMine_returnsOrdersWithItems() {
        seedSku(5);
        orderService.create(userId, buyNow(1));

        PageResult<OrderWithItems> page = orderService.pageMine(userId, null, new PageParams(1, 10));
        assertEquals(1, page.total());
        assertEquals(1, page.records().getFirst().items().size());
    }
}
