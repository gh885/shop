package com.shop.platform.infra.scheduler;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.stereotype.Component;

/**
 * 定时任务的多实例互斥，用 PG 会话级 advisory lock。
 *
 * <p>@Scheduled 在每个实例上都会跑。任务自带幂等（CAS、唯一索引）的，重复跑只是浪费；
 * 结算、事件补发这类"先读后写"的任务，重复跑是资金和重复消费事故。入口上锁，一个时刻
 * 全集群只有一个实例在跑同一个任务。
 *
 * <p><b>为什么不用 {@code pg_advisory_xact_lock}：</b> 它只在单个事务内存活，而任务体里是
 * 多个独立事务。会话级锁跟着连接走，所以这里必须**借一条连接、用完在同一条上解锁**——
 * 普通的两条 SQL 会落在池里不同的连接上，解锁时 PG 会告诉你"你根本没持有这把锁"。
 * 连接在任务期间被占用是有意的代价：调度线程池只有几个线程，同时被占的连接也就几个。
 *
 * <p><b>观测在锁这里统一做</b>，不指望每个任务记得给自己加：持锁执行记
 * {@code shop.job.duration}（Timer）、任务体抛异常记 {@code shop.job.failure}、
 * 锁被别的实例占走记 {@code shop.job.skipped}、任务体返回的处理条数记
 * {@code shop.job.processed}。指标名统一叫 {@code shop.job.*}，job 标签取锁名去掉
 * {@code shop.job.} 前缀（如 {@code trade.expiry}）。跑没跑、跑了多久、失败没有、
 * 处理多少条，Prometheus 上一屏看完；手动触发口（{@link JobRegistry}）的反馈也指回这里。
 *
 * <p>拿不到锁 = 另一个实例正在跑，**静默跳过**，不是错误。
 */
@Component
public class JobLock {

    private static final Logger log = LoggerFactory.getLogger(JobLock.class);

    private static final String PREFIX = "shop.job.";

    private final DataSource dataSource;
    private final MeterRegistry registry;

    public JobLock(DataSource dataSource, MeterRegistry registry) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource");
        this.registry = Objects.requireNonNull(registry, "registry");
    }

    /**
     * 任务体，返回本轮处理条数（0 或负不计数）。语义由任务自定：关了多少单、补发了多少条、
     * 发现了多少条对账差异——它们都回答同一个问题：这轮干了多少活。
     */
    @FunctionalInterface
    public interface TaskBody {

        int run();
    }

    /**
     * 拿到锁就跑 {@code body}，返回 body 的处理条数；拿不到（别的实例在跑）返回 0。
     * 异常不吞，照常抛给调用方（@Scheduled 的默认 error handler 会记 ERROR）。
     */
    public int withLock(String name, TaskBody body) {
        Connection connection = DataSourceUtils.getConnection(dataSource);
        boolean locked = false;
        boolean failed = false;
        long start = System.nanoTime();
        try {
            locked = tryLock(connection, name);
            if (!locked) {
                skipped(name).increment();
                log.debug("任务锁被占用，跳过本轮：{}", name);
                return 0;
            }
            int processed = body.run();
            if (processed > 0) {
                processed(name).increment(processed);
            }
            return processed;
        } catch (RuntimeException e) {
            failed = true;
            throw e;
        } finally {
            if (locked) {
                duration(name).record(System.nanoTime() - start, TimeUnit.NANOSECONDS);
                if (failed) {
                    failed(name).increment();
                }
                unlock(connection, name);
            }
            DataSourceUtils.releaseConnection(connection, dataSource);
        }
    }

    private boolean tryLock(Connection connection, String name) {
        try (PreparedStatement statement = connection.prepareStatement("SELECT pg_try_advisory_lock(hashtext(?))")) {
            statement.setString(1, name);
            try (ResultSet rs = statement.executeQuery()) {
                return rs.next() && rs.getBoolean(1);
            }
        } catch (Exception e) {
            throw new IllegalStateException("任务锁获取失败: " + name, e);
        }
    }

    private void unlock(Connection connection, String name) {
        try (PreparedStatement statement = connection.prepareStatement("SELECT pg_advisory_unlock(hashtext(?))")) {
            statement.setString(1, name);
            try (ResultSet rs = statement.executeQuery()) {
                if (!rs.next() || !rs.getBoolean(1)) {
                    // 正常不会发生；发生了说明连接被换过，锁会随会话断开自动释放，但得让人知道
                    log.warn("任务锁解锁失败（连接可能已被替换）：{}", name);
                }
            }
        } catch (Exception e) {
            log.warn("任务锁解锁异常：{}", name, e);
        }
    }

    private Timer duration(String name) {
        return Timer.builder("shop.job.duration")
                .description("一次持锁执行的耗时")
                .tag("job", tag(name))
                .register(registry);
    }

    private Counter failed(String name) {
        return Counter.builder("shop.job.failure")
                .description("任务体抛异常的轮次")
                .tag("job", tag(name))
                .register(registry);
    }

    private Counter skipped(String name) {
        return Counter.builder("shop.job.skipped")
                .description("锁被其他实例占走而跳过的轮次")
                .tag("job", tag(name))
                .register(registry);
    }

    private Counter processed(String name) {
        return Counter.builder("shop.job.processed")
                .description("本轮处理条数（关单数 / 补发数 / 差异数等，语义由任务自定）")
                .tag("job", tag(name))
                .register(registry);
    }

    private static String tag(String name) {
        return name.startsWith(PREFIX) ? name.substring(PREFIX.length()) : name;
    }
}
