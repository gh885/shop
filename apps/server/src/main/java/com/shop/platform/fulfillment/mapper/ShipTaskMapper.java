package com.shop.platform.fulfillment.mapper;

import com.shop.platform.common.id.Ids;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * {@code ship_task} 的写入。
 *
 * <p>发货时效三件事：建任务（付款时）、置完成（第一个包裹发出）、超时检测（{@link
 * com.shop.platform.fulfillment.service.ShipDeadlineJob}——置 overdue 并把线索报给 governance）。
 */
@Mapper
public interface ShipTaskMapper {

    /** 建任务。已存在就跳过——一个商家单一条任务。 */
    default void createIfAbsent(UUID sellerOrderId, UUID merchantId, Instant dueAt) {
        insertRow(Ids.newId(), sellerOrderId, merchantId, dueAt);
    }

    @Insert(
            """
            INSERT INTO fulfillment.ship_task (id, seller_order_id, merchant_id, due_at)
            VALUES (#{id}, #{sellerOrderId}, #{merchantId}, #{dueAt})
            ON CONFLICT (seller_order_id) DO NOTHING
            """)
    void insertRow(
            @Param("id") UUID id,
            @Param("sellerOrderId") UUID sellerOrderId,
            @Param("merchantId") UUID merchantId,
            @Param("dueAt") Instant dueAt);

    /**
     * 置已完成。
     *
     * <p>条件里带 {@code status IN ('pending', 'overdue')}：{@code overdue} 之后仍然可以发货，
     * 它只表示曾经超过承诺时间，不是终态。
     */
    @Update(
            """
            UPDATE fulfillment.ship_task
               SET status = 'shipped'
             WHERE seller_order_id = #{sellerOrderId} AND status IN ('pending', 'overdue')
            """)
    void markShipped(@Param("sellerOrderId") UUID sellerOrderId);

    /** 超时检测的扫描面，走 idx_ship_task_due 部分索引。 */
    @Select(
            """
            SELECT id, seller_order_id, merchant_id, due_at, status
              FROM fulfillment.ship_task
             WHERE status = 'pending' AND due_at < #{olderThan}
             ORDER BY due_at
             LIMIT #{limit}
            """)
    List<TaskRow> findPendingDue(@Param("olderThan") Instant olderThan, @Param("limit") int limit);

    /** false = 已被别的路径推进（发货了、取消了），本次不算超时。 */
    @Update(
            """
            UPDATE fulfillment.ship_task
               SET status = 'overdue', overdue_at = now()
             WHERE seller_order_id = #{sellerOrderId} AND status = 'pending'
            """)
    boolean markOverdue(@Param("sellerOrderId") UUID sellerOrderId);

    /** 不再需要履约（订单关闭、全额退款未发货）的任务作废，不算超时。 */
    @Update(
            """
            UPDATE fulfillment.ship_task
               SET status = 'cancelled'
             WHERE seller_order_id = #{sellerOrderId} AND status = 'pending'
            """)
    void cancel(@Param("sellerOrderId") UUID sellerOrderId);

    public record TaskRow(UUID id, UUID sellerOrderId, UUID merchantId, Instant dueAt, String status) {}
}
