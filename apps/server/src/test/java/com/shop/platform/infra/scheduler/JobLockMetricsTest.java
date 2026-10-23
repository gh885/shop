package com.shop.platform.infra.scheduler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.micrometer.core.instrument.MeterRegistry;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * JobLock 的观测：所有定时任务的公共咽喉，时长 / 失败 / 跳过 / 处理条数四组指标都在这里记。
 * 指标是任务的唯一健康信号（日志会沉），记漏一条就等于那个任务没有健康信号。
 */
@SpringBootTest
@ActiveProfiles("test")
class JobLockMetricsTest {

    @Autowired
    private JobLock jobLock;

    @Autowired
    private MeterRegistry registry;

    @Autowired
    private DataSource dataSource;

    @Test
    void 持锁执行记时长与处理条数() {
        int processed = jobLock.withLock("shop.job.metrics.demo", () -> 3);

        assertThat(processed).isEqualTo(3);
        assertThat(registry.get("shop.job.processed")
                        .tag("job", "metrics.demo")
                        .counter()
                        .count())
                .isEqualTo(3.0);
        assertThat(registry.get("shop.job.duration")
                        .tag("job", "metrics.demo")
                        .timer()
                        .count())
                .isEqualTo(1);
    }

    @Test
    void 任务体抛异常_失败计数_异常照抛_时长仍记录() {
        assertThatThrownBy(() -> jobLock.withLock("shop.job.metrics.boom", () -> {
                    throw new IllegalStateException("任务体失败");
                }))
                .isInstanceOf(IllegalStateException.class);

        assertThat(registry.get("shop.job.failure")
                        .tag("job", "metrics.boom")
                        .counter()
                        .count())
                .isEqualTo(1.0);
        assertThat(registry.get("shop.job.duration")
                        .tag("job", "metrics.boom")
                        .timer()
                        .count())
                .isEqualTo(1);
        // 没有处理条数可记
        assertThat(registry.find("shop.job.processed")
                        .tag("job", "metrics.boom")
                        .counter())
                .isNull();
    }

    @Test
    void 锁被别的会话占走_跳过计数_任务体不执行() throws Exception {
        // 在另一条连接上手动持有同名锁——模拟另一个实例正在跑
        try (Connection connection = dataSource.getConnection();
                PreparedStatement lock = connection.prepareStatement("SELECT pg_try_advisory_lock(hashtext(?))")) {
            lock.setString(1, "shop.job.metrics.contended");
            try (ResultSet rs = lock.executeQuery()) {
                assertThat(rs.next() && rs.getBoolean(1)).isTrue();
            }

            AtomicInteger ran = new AtomicInteger();
            int processed = jobLock.withLock("shop.job.metrics.contended", () -> ran.incrementAndGet());

            assertThat(processed).isZero();
            assertThat(ran.get()).isZero();
            assertThat(registry.get("shop.job.skipped")
                            .tag("job", "metrics.contended")
                            .counter()
                            .count())
                    .isEqualTo(1.0);
        }
        // 连接关闭，会话锁自动释放，不影响后续轮次
    }
}
