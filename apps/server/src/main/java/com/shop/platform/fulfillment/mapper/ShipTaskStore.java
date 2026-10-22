package com.shop.platform.fulfillment.mapper;

import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * {@code ship_task} 的写入。
 *
 * <p>发货时效这一版只做"第一个包裹发出就置 shipped"，超时检测没做——
 * 那要把违规线索报给 {@code trust}，而 trust 还没有接收线索的接口。
 */
@Component
public class ShipTaskStore {

    private static final String INSERT =
            """
            INSERT INTO fulfillment.ship_task (id, seller_order_id, merchant_id, due_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (seller_order_id) DO NOTHING
            """;

    /**
     * 置已完成。
     *
     * <p>条件里带 {@code status IN ('pending', 'overdue')}：{@code overdue} 之后仍然可以发货，
     * 它只表示曾经超过承诺时间，不是终态。
     */
    private static final String MARK_SHIPPED =
            """
            UPDATE fulfillment.ship_task
               SET status = 'shipped'
             WHERE seller_order_id = ? AND status IN ('pending', 'overdue')
            """;

    private final JdbcTemplate jdbc;

    public ShipTaskStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 建任务。已存在就跳过——一个商家单一条任务。 */
    public void createIfAbsent(UUID sellerOrderId, UUID merchantId, java.time.Instant dueAt) {
        jdbc.update(
                INSERT,
                com.shop.platform.common.id.Ids.newId(),
                sellerOrderId,
                merchantId,
                java.sql.Timestamp.from(dueAt));
    }

    public void markShipped(UUID sellerOrderId) {
        jdbc.update(MARK_SHIPPED, sellerOrderId);
    }
}
