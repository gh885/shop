package com.shop.platform.common.event;

import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 事件消费去重。投递是 at-least-once，同一条事件可能来两遍，这里负责把第二遍挡掉。
 *
 * <p><b>必须和消费方的业务写操作在同一个事务里。</b> 抢占成功但业务回滚，等于白白吃掉一条事件；反过来业务提交了但抢占没提交，下次还会重复处理。
 *
 * <p>实现上只有一种正确写法：{@code INSERT ... ON CONFLICT DO NOTHING} 看影响行数。
 *
 * <ul>
 *   <li>"先查再插" —— 两个消费者同时查都得到"没消费过"，然后都处理，去重白做。
 *   <li>"try/catch 唯一键冲突" —— PostgreSQL 里一条语句报错后整个事务就废了，catch 住也无法继续，只能整体重来。
 * </ul>
 */
@Component
public class EventInbox {

    private static final String CLAIM =
            """
            INSERT INTO common.consumed_event (consumer, event_id)
            VALUES (?, ?)
            ON CONFLICT DO NOTHING
            """;

    private final JdbcTemplate jdbc;

    public EventInbox(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /**
     * 抢占这条事件。
     *
     * @return {@code true} 第一次见到，可以继续处理；{@code false} 重复投递，直接跳过
     */
    public boolean claim(String consumer, UUID eventId) {
        if (consumer == null || consumer.isBlank()) {
            throw new IllegalArgumentException("consumer 不能为空");
        }
        Objects.requireNonNull(eventId, "eventId");

        return jdbc.update(CLAIM, consumer, eventId) == 1;
    }
}
