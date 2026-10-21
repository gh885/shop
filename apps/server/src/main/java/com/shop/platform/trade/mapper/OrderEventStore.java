package com.shop.platform.trade.mapper;

import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * {@code order_event} 的只追加写入。
 *
 * <p>每次状态变更一行。没有它，"这单为什么被关了"只能靠猜。
 *
 * <p>幂等键 {@code {order_kind}:{order_id}:{dimension}:{source}} 撞唯一索引就是重复消费，返回 false 让调用方跳过。
 */
@Component
public class OrderEventStore {

    private static final String INSERT =
            """
            INSERT INTO trade.order_event
                (event_key, order_kind, order_id, dimension, from_value, to_value, actor_type, actor_id, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (event_key) DO NOTHING
            """;

    private final JdbcTemplate jdbc;

    public OrderEventStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 返回 false = 这个幂等键已经记过，本次是重复消费。 */
    public boolean append(
            String eventKey,
            String orderKind,
            UUID orderId,
            String dimension,
            String fromValue,
            String toValue,
            String actorType,
            UUID actorId,
            String reason) {
        return jdbc.update(
                        INSERT, eventKey, orderKind, orderId, dimension, fromValue, toValue, actorType, actorId, reason)
                == 1;
    }
}
