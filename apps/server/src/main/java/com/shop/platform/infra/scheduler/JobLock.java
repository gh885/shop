package com.shop.platform.infra.scheduler;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Objects;
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
 * <p>拿不到锁 = 另一个实例正在跑，**静默跳过**，不是错误。
 */
@Component
public class JobLock {

    private static final Logger log = LoggerFactory.getLogger(JobLock.class);

    private final DataSource dataSource;

    public JobLock(DataSource dataSource) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource");
    }

    /** 拿到锁就跑 {@code body}，拿不到（别的实例在跑）直接返回。异常不吞，照常抛给调用方。 */
    public void withLock(String name, Runnable body) {
        Connection connection = DataSourceUtils.getConnection(dataSource);
        boolean locked = false;
        try {
            locked = tryLock(connection, name);
            if (!locked) {
                log.debug("任务锁被占用，跳过本轮：{}", name);
                return;
            }
            body.run();
        } finally {
            if (locked) {
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
}
