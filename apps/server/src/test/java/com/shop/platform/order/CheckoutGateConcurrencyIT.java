package com.shop.platform.order;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.shop.platform.common.BusinessException;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 恶拍闸门在<b>真并发</b>下的可靠性（真库 + 真线程）：同一买家同时发 16 次结算，在途待付款上限不被挤穿。
 *
 * <p>为什么必须真起线程：闸门是「先 count 再 insert」，串行用例里每次都数得准；只有并发时 16 个请求才会
 * 各自读到同一个 9、各自认为还差一单——这是写偏斜（各插自己的单、互不碰对方的行），
 * 行级手段挡不住，靳靠 {@code OrderMapper.lockCheckoutGate} 按 userId 把本人的结算串成一条线（docs/adr/0002）。
 * 而会同时发 16 发的恰恰是这道闸要挡的脚本——不锁，闸门就在该起作用时失效。
 */
@SpringBootTest
class CheckoutGateConcurrencyIT extends IntegrationTestSupport {

    /** 并发线程数刻意大于 HikariCP 默认池大小（10）：连接排队 + 咨询锁排队才是真实争抢形态 */
    private static final int THREADS = 16;

    /** 与 {@code OrderService.MAX_PENDING_PAYMENT_ORDERS} 同值：那是 private 常量，这里按业务口径写死 */
    private static final int PENDING_CAP = 10;

    @Autowired
    private OrderService orderService;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    private UUID addressId;

    private void seed() {
        db.seedActiveUser(userId);
        db.onDeleteBuyerOrderChain(userId);
        skuId = db.seedOnSaleSku(shopId, 1000, 100); // 库存给足，确保失败只可能来自闸门
        addressId = db.seedAddress(userId);
        db.seedShipAddress(shopId);
    }

    /** 每次结算一个新的 checkoutKey：幂等键相同会被当成重放回读原单，就不是 16 次独立结算了 */
    private CreateOrderRequest buyOne() {
        return new CreateOrderRequest(
                UUID.randomUUID(), addressId, List.of(new OrderLineRequest(skuId, 1)), null, null);
    }

    private long pendingCount() {
        return jdbc.queryForObject(
                "SELECT count(*) FROM orders.trades WHERE user_id = ?::uuid AND status = 'PENDING_PAYMENT'",
                Long.class,
                userId.toString());
    }

    @Test
    void 同一买家并发结算_在途待付款上限不被挤穿() throws Exception {
        seed();
        // 先把在途单填到上限减一：下一单恰好把它补满，之后的一律该被挡
        for (int i = 0; i < PENDING_CAP - 1; i++) {
            orderService.create(userId, buyOne());
        }
        assertEquals(PENDING_CAP - 1, pendingCount());

        CountDownLatch startGun = new CountDownLatch(1);
        AtomicInteger succeeded = new AtomicInteger();
        AtomicInteger rateLimited = new AtomicInteger();
        AtomicInteger otherFailures = new AtomicInteger();
        try (ExecutorService pool = Executors.newFixedThreadPool(THREADS)) {
            List<Future<?>> futures = new ArrayList<>();
            for (int i = 0; i < THREADS; i++) {
                futures.add(pool.submit(() -> {
                    startGun.await(); // 全员就位后同时开抢，最大化竞争窗口
                    try {
                        orderService.create(userId, buyOne());
                        succeeded.incrementAndGet();
                    } catch (BusinessException e) {
                        if (e.getHttpStatus() == 429) {
                            rateLimited.incrementAndGet();
                        } else {
                            otherFailures.incrementAndGet();
                        }
                    }
                    return null;
                }));
            }
            startGun.countDown();
            for (Future<?> f : futures) {
                f.get(60, TimeUnit.SECONDS); // 任务内已吞 BusinessException，此处抛出即非预期故障
            }
        }

        // 只有把第 10 单补满的那一个能过，其余 15 个全部 429；不该有别的失败形态
        assertEquals(1, succeeded.get(), "闸门被挤穿：多个并发结算各自读到 9 都放行了");
        assertEquals(THREADS - 1, rateLimited.get());
        assertEquals(0, otherFailures.get());
        assertEquals(PENDING_CAP, pendingCount());
    }
}
