package com.shop.platform.fulfillment.mapper;

import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.db.RowMappers;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * {@code ship_task} 的写入。
 *
 * <p>发货时效三件事：建任务（付款时）、置完成（第一个包裹发出）、超时检测（{@link
 * com.shop.platform.fulfillment.service.ShipDeadlineJob}——置 overdue 并把线索报给 trust）。
 */
@Component
public class ShipTaskStore {

    private static final String INSERT =
            """
            INSERT INTO fulfillment.ship_task (id, seller_order_id, merchant_id, due_at)
            VALUES (:id, :sellerOrderId, :merchantId, :dueAt)
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
             WHERE seller_order_id = :sellerOrderId AND status IN ('pending', 'overdue')
            """;

    /** 超时检测的扫描面，走 idx_ship_task_due 部分索引。 */
    private static final String FIND_PENDING_DUE =
            """
            SELECT id, seller_order_id, merchant_id, due_at, status
              FROM fulfillment.ship_task
             WHERE status = 'pending' AND due_at < :olderThan
             ORDER BY due_at
             LIMIT :limit
            """;

    /** false = 已被别的路径推进（发货了、取消了），本次不算超时。 */
    private static final String MARK_OVERDUE =
            """
            UPDATE fulfillment.ship_task
               SET status = 'overdue', overdue_at = now()
             WHERE seller_order_id = :sellerOrderId AND status = 'pending'
            """;

    /** 不再需要履约（订单关闭、全额退款未发货）的任务作废，不算超时。 */
    private static final String CANCEL =
            """
            UPDATE fulfillment.ship_task
               SET status = 'cancelled'
             WHERE seller_order_id = :sellerOrderId AND status = 'pending'
            """;

    private static final RowMapper<TaskRow> MAPPER = RowMappers.of(TaskRow.class);

    private final JdbcClient jdbc;

    public ShipTaskStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 建任务。已存在就跳过——一个商家单一条任务。 */
    public void createIfAbsent(UUID sellerOrderId, UUID merchantId, Instant dueAt) {
        jdbc.sql(INSERT)
                .param("id", Ids.newId())
                .param("sellerOrderId", sellerOrderId)
                .param("merchantId", merchantId)
                .param("dueAt", RowMappers.toDb(dueAt))
                .update();
    }

    public void markShipped(UUID sellerOrderId) {
        jdbc.sql(MARK_SHIPPED).param("sellerOrderId", sellerOrderId).update();
    }

    public List<TaskRow> findPendingDue(Instant olderThan, int limit) {
        return jdbc.sql(FIND_PENDING_DUE)
                .param("olderThan", RowMappers.toDb(olderThan))
                .param("limit", limit)
                .query(MAPPER)
                .list();
    }

    /** false = 已不是 pending（发货/取消先到），不算这轮的超时。 */
    public boolean markOverdue(UUID sellerOrderId) {
        return jdbc.sql(MARK_OVERDUE).param("sellerOrderId", sellerOrderId).update() == 1;
    }

    public void cancel(UUID sellerOrderId) {
        jdbc.sql(CANCEL).param("sellerOrderId", sellerOrderId).update();
    }

    public record TaskRow(UUID id, UUID sellerOrderId, UUID merchantId, Instant dueAt, String status) {}
}
