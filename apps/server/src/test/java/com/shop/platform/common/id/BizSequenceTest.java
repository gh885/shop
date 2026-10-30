package com.shop.platform.common.id;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.testsupport.IntegrationTest;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 需要本地 PG（{@code docker compose -f compose.dev.yml up -d}）和 {@code shop_test} 库。
 *
 * <p>写库不用 {@code @Transactional}：并发测试必须让每次发号真的提交，否则测的是 Spring 的回滚而不是行锁。
 */
class BizSequenceTest extends IntegrationTest {

    @Autowired
    private BizSequence sequence;

    @Autowired
    private PlatformTransactionManager transactionManager;

    /** 每个测试用自己的 period，互不干扰，也不用清表。 */
    private static String newPeriod() {
        return UUID.randomUUID().toString();
    }

    @Test
    void concurrentCallersGetDistinctContiguousNumbers() throws Exception {
        String period = newPeriod();
        int threads = 8;
        int perThread = 250;
        int expected = threads * perThread;

        Set<Long> seen = ConcurrentHashMap.newKeySet();
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<?>> futures = new ArrayList<>();
        try {
            for (int t = 0; t < threads; t++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    for (int i = 0; i < perThread; i++) {
                        seen.add(sequence.next("test", period));
                    }
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> future : futures) {
                future.get(120, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(seen).hasSize(expected);
        assertThat(seen)
                .containsExactlyInAnyOrderElementsOf(
                        LongStream.rangeClosed(1, expected).boxed().toList());
    }

    @Test
    void numberRollsBackTogetherWithTheSurroundingTransaction() {
        String period = newPeriod();
        TransactionTemplate tx = new TransactionTemplate(transactionManager);

        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
                    sequence.next("test", period);
                    throw new IllegalStateException("业务写失败");
                }))
                .isInstanceOf(IllegalStateException.class);

        // 号跟着回滚了，下一个还是 1——这正是它相对 PG SEQUENCE 的全部价值
        assertThat(sequence.next("test", period)).isEqualTo(1L);
    }

    @Test
    void namespacesAndPeriodsAreIndependent() {
        String period = newPeriod();

        assertThat(sequence.next("voucher", period)).isEqualTo(1L);
        assertThat(sequence.next("invoice", period)).isEqualTo(1L);
        assertThat(sequence.next("voucher", period)).isEqualTo(2L);
        assertThat(sequence.next("voucher", newPeriod())).isEqualTo(1L);
    }

    @Test
    void takeReservesAContiguousRange() {
        String period = newPeriod();

        BizSequence.Range first = sequence.take("voucher", period, 5);
        BizSequence.Range second = sequence.take("voucher", period, 3);

        assertThat(first.first()).isEqualTo(1L);
        assertThat(first.last()).isEqualTo(5L);
        assertThat(first.size()).isEqualTo(5L);
        assertThat(second.first()).isEqualTo(6L);
        assertThat(second.last()).isEqualTo(8L);
    }

    @Test
    void nonPositiveCountIsRejected() {
        assertThatThrownBy(() -> sequence.take("voucher", newPeriod(), 0)).isInstanceOf(IllegalArgumentException.class);
    }
}
