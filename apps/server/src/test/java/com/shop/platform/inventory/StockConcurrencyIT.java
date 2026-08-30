package com.shop.platform.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.BusinessException;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
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
 * 库存条件更新的<b>真并发</b>验证（真库 + 真线程）：多线程同时抢同一行，验证
 * 「WHERE 闸门 + RETURNING OLD/NEW」在 PG 默认 READ COMMITTED 下的不超卖与账本连续性。
 *
 * <p>为什么必须真起线程：OrderFlowIT 的「并发窗口_库存抢空」是单线程手动清空库存后再下单，
 * 验的是<b>闸门未过时的响应</b>，不是<b>并发下闸门本身是否可靠</b>。丢失更新（两个事务读到同一帧
 * 后各自扣减）只在真实竞争下才暴露，靠推理和串行用例都测不出来。
 *
 * <p>断言里最关键的是「前帧互不重复」：每笔成功变更看到的 before_available 若出现重复，
 * 说明两个事务读到了同一帧 = 丢失更新 = 超卖。这条断言不依赖流水的排序（uuidv7 同毫秒内不保序，
 * 按时间排序做链式衔接断言会假失败），只依赖集合唯一性，因此并发下稳定可靠。
 */
@SpringBootTest
class StockConcurrencyIT extends IntegrationTestSupport {

    /** 并发线程数刻意大于 HikariCP 默认池大小（10）：连接排队 + 行锁排队才是真实争抢形态 */
    private static final int THREADS = 16;

    private static final int INITIAL_STOCK = 8;

    @Autowired
    private StockCommand stockCommand;

    private final UUID shopId = UUID.randomUUID();

    private int stockOf(UUID skuId) {
        return jdbc.queryForObject(
                "SELECT stock FROM inventory.sku_stock WHERE sku_id = ?::uuid", Integer.class, skuId.toString());
    }

    private int frozenOf(UUID skuId) {
        return jdbc.queryForObject(
                "SELECT frozen_stock FROM inventory.sku_stock WHERE sku_id = ?::uuid", Integer.class, skuId.toString());
    }

    private List<Integer> beforeAvailableFramesOf(UUID skuId, String type) {
        return jdbc.queryForList(
                "SELECT before_available FROM inventory.stock_movements WHERE sku_id = ?::uuid AND type = ?",
                Integer.class,
                skuId.toString(),
                type);
    }

    /** 同时起跑跑 THREADS 个任务，返回成功数；每个任务抛 BusinessException 记为失败（并携带错误码校验） */
    private int raceForSuccess(Callable<Void> task, AtomicInteger conflictCode) throws Exception {
        CountDownLatch startGun = new CountDownLatch(1);
        AtomicInteger succeeded = new AtomicInteger();
        try (ExecutorService pool = Executors.newFixedThreadPool(THREADS)) {
            List<Future<?>> futures = new java.util.ArrayList<>();
            for (int i = 0; i < THREADS; i++) {
                futures.add(pool.submit(() -> {
                    startGun.await(); // 全员就位后同时开抢，最大化竞争窗口
                    try {
                        task.call();
                        succeeded.incrementAndGet();
                    } catch (BusinessException e) {
                        conflictCode.set(e.getHttpStatus());
                    }
                    return null;
                }));
            }
            startGun.countDown();
            for (Future<?> f : futures) {
                f.get(30, TimeUnit.SECONDS); // 任务内已吞 BusinessException，此处抛出即非预期故障
            }
        }
        return succeeded.get();
    }

    /**
     * 核心不变式：16 线程各抢 1 件、库存 8 件 → 恰好 8 笔成功，多出的 8 笔被闸门挡回 409；
     * 总库存不动、冻结量精确等于卖出量、可用量归零，且 8 条 FREEZE 流水的前帧互不重复。
     */
    @Test
    void 并发抢同一SKU_恰好卖完不超卖_账本前帧不重复() throws Exception {
        UUID skuId = db.seedOnSaleSku(shopId, 1000, INITIAL_STOCK);
        AtomicInteger conflictStatus = new AtomicInteger();

        int succeeded = raceForSuccess(
                () -> {
                    stockCommand.freeze(UUID.randomUUID(), List.of(new StockLine(skuId, 1)));
                    return null;
                },
                conflictStatus);

        // 1. 恰好卖完：成功数 = 库存数，一件不多一件不少
        assertThat(succeeded).isEqualTo(INITIAL_STOCK);
        assertThat(conflictStatus.get()).isEqualTo(409); // 抢空后的失败是 409 而非 500

        // 2. 存量三口径自洽：冻结即卖出，总库存未动（扣实才动），可用归零
        assertThat(frozenOf(skuId)).isEqualTo(INITIAL_STOCK);
        assertThat(stockOf(skuId)).isEqualTo(INITIAL_STOCK);
        assertThat(stockOf(skuId) - frozenOf(skuId)).isZero();

        // 3. 账本每笔一条、且前帧互不重复 —— 重复即两个事务读到同一帧（丢失更新），也就是超卖
        List<Integer> frames = beforeAvailableFramesOf(skuId, "FREEZE");
        assertThat(frames).hasSize(INITIAL_STOCK).doesNotHaveDuplicates();
        // 前帧集合恰好是 8,7,…,1：账本可从初始值无跳帧重放到当前值
        assertThat(frames).containsExactlyInAnyOrder(8, 7, 6, 5, 4, 3, 2, 1);
    }

    /**
     * 对称防御：冻结量只有 8，16 个线程同时释放 1 件 → 只能成功 8 笔，冻结量不被扣穿成负数
     * （DB 侧 CHECK 也拦，但业务应先给出 409 而不是把约束异常漏成 500）。
     */
    @Test
    void 并发释放同一SKU_冻结量不被扣穿() throws Exception {
        UUID skuId = db.seedOnSaleSku(shopId, 1000, INITIAL_STOCK);
        UUID orderId = UUID.randomUUID();
        stockCommand.freeze(orderId, List.of(new StockLine(skuId, INITIAL_STOCK))); // 先把库存全冻上
        AtomicInteger conflictStatus = new AtomicInteger();

        int succeeded = raceForSuccess(
                () -> {
                    stockCommand.release(orderId, List.of(new StockLine(skuId, 1)));
                    return null;
                },
                conflictStatus);

        assertThat(succeeded).isEqualTo(INITIAL_STOCK);
        assertThat(conflictStatus.get()).isEqualTo(409);
        // 冻结归零而非负数，总库存全程不变，货完整回到可卖池
        assertThat(frozenOf(skuId)).isZero();
        assertThat(stockOf(skuId)).isEqualTo(INITIAL_STOCK);
        assertThat(beforeAvailableFramesOf(skuId, "RELEASE"))
                .hasSize(INITIAL_STOCK)
                .doesNotHaveDuplicates();
    }
}
