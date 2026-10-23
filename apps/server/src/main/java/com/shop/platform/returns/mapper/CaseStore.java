package com.shop.platform.returns.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 售后单的读写。SQL 只住在这里。
 *
 * <p>两条写法上的约定：
 *
 * <ul>
 *   <li>状态推进一律 CAS（{@code WHERE status = :expected}），影响 0 行说明别人先动了——
 *       两个人同时点"同意"不能都成功
 *   <li>{@code deadline_*} 三列永远一起写。只写一半的 deadline 是没人能执行的死数据，
 *       库约束 {@code ck_case_deadline} 也会拒
 * </ul>
 */
@Component
public class CaseStore {

    private static final String COLUMNS =
            """
            id, case_no, seller_order_id, merchant_id, buyer_id, type, status, reason_code, responsibility,
            refund_amount, shipping_refund_amount, currency, deadline_at, deadline_actor, deadline_action,
            approved_at, completed_at, created_at
            """;

    private static final String INSERT_CASE =
            """
            INSERT INTO returns.after_sale_case
                (id, case_no, seller_order_id, merchant_id, buyer_id, type, status, reason_code,
                 responsibility, refund_amount, shipping_refund_amount, currency,
                 deadline_at, deadline_actor, deadline_action)
            VALUES (:id, :caseNo, :sellerOrderId, :merchantId, :buyerId, :type, :status, :reasonCode,
                    :responsibility, :refundAmount, :shippingRefundAmount, :currency,
                    :deadlineAt, :deadlineActor, :deadlineAction)
            """;

    private static final String INSERT_ITEM =
            """
            INSERT INTO returns.case_item (case_id, order_line_id, quantity, refund_amount)
            VALUES (:caseId, :orderLineId, :quantity, :refundAmount)
            """;

    private static final String INSERT_LOG =
            """
            INSERT INTO returns.case_log (case_id, from_status, to_status, actor_type, actor_id, reason)
            VALUES (:caseId, :fromStatus, :toStatus, :actorType, :actorId, :reason)
            """;

    private static final String FIND = "SELECT " + COLUMNS + " FROM returns.after_sale_case WHERE id = :id";

    private static final String FIND_ITEMS =
            """
            SELECT order_line_id, quantity, refund_amount
              FROM returns.case_item
             WHERE case_id = :caseId
             ORDER BY order_line_id
            """;

    /** 一批 case 的全部明细，一次取回。列表页用它，不再每个 case 发一条查询。 */
    private static final String FIND_ITEMS_BY_CASES =
            """
            SELECT case_id, order_line_id, quantity, refund_amount
              FROM returns.case_item
             WHERE case_id IN (:caseIds)
             ORDER BY case_id, order_line_id
            """;

    private static final String LIST_BY_BUYER = "SELECT " + COLUMNS
            + """
             FROM returns.after_sale_case
             WHERE buyer_id = :buyerId
             ORDER BY created_at DESC
             LIMIT :limit
            """;

    private static final String LIST_BY_MERCHANT = "SELECT " + COLUMNS
            + """
             FROM returns.after_sale_case
             WHERE merchant_id = :merchantId
             ORDER BY created_at DESC
             LIMIT :limit
            """;

    /**
     * 状态推进。{@code approved_at} / {@code completed_at} 用 COALESCE 保留旧值——
     * 写 null 不等于"清空"，而是"这次不动它"。
     */
    private static final String UPDATE_STATUS =
            """
            UPDATE returns.after_sale_case
               SET status = :status,
                   deadline_at = CAST(:deadlineAt AS timestamptz),
                   deadline_actor = :deadlineActor,
                   deadline_action = :deadlineAction,
                   approved_at = COALESCE(CAST(:approvedAt AS timestamptz), approved_at),
                   completed_at = COALESCE(CAST(:completedAt AS timestamptz), completed_at)
             WHERE id = :id AND status = :expected
            """;

    /** 超时扫描只扫非终态；{@code disputed} 的时钟归 dispute，不在这里推进。 */
    private static final String FIND_DUE = "SELECT " + COLUMNS
            + """
             FROM returns.after_sale_case
             WHERE deadline_at IS NOT NULL AND deadline_at < now()
               AND status NOT IN ('completed', 'cancelled', 'rejected', 'disputed')
             ORDER BY deadline_at
             LIMIT :limit
            """;

    /** 这个订单行有没有未终态的 case。提交前必须为空，否则会退两次。 */
    private static final String OPEN_CASE_OF_LINE =
            """
            SELECT c.id
              FROM returns.case_item i
              JOIN returns.after_sale_case c ON c.id = i.case_id
             WHERE i.order_line_id = :orderLineId
               AND c.status NOT IN ('completed', 'cancelled', 'rejected')
             LIMIT 1
            """;

    /**
     * 事务级咨询锁。上面那条检查挡不住并发：两个请求同时查到"没有未终态 case"，然后都插入。
     * 锁的键是订单行 id，粒度足够细，不会互相挡。
     */
    private static final String LOCK_LINE = "SELECT pg_advisory_xact_lock(hashtext(:key))";

    private static final RowMapper<CaseRow> CASE_MAPPER = RowMappers.of(CaseRow.class);

    private static final RowMapper<ItemRow> ITEM_MAPPER = RowMappers.of(ItemRow.class);

    private final JdbcClient jdbc;

    public CaseStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void lockLine(UUID orderLineId) {
        jdbc.sql(LOCK_LINE)
                .param("key", orderLineId.toString())
                .query((rs, row) -> rs.getObject(1))
                .list();
    }

    public void insertCase(NewCase row) {
        jdbc.sql(INSERT_CASE)
                .param("id", row.id())
                .param("caseNo", row.caseNo())
                .param("sellerOrderId", row.sellerOrderId())
                .param("merchantId", row.merchantId())
                .param("buyerId", row.buyerId())
                .param("type", row.type())
                .param("status", row.status())
                .param("reasonCode", row.reasonCode())
                .param("responsibility", row.responsibility())
                .param("refundAmount", row.refundAmount())
                .param("shippingRefundAmount", row.shippingRefundAmount())
                .param("currency", row.currency())
                .param("deadlineAt", RowMappers.toDb(row.deadlineAt()))
                .param("deadlineActor", row.deadlineActor())
                .param("deadlineAction", row.deadlineAction())
                .update();
    }

    public void insertItem(UUID caseId, UUID orderLineId, int quantity, long refundAmount) {
        jdbc.sql(INSERT_ITEM)
                .param("caseId", caseId)
                .param("orderLineId", orderLineId)
                .param("quantity", quantity)
                .param("refundAmount", refundAmount)
                .update();
    }

    public void insertLog(
            UUID caseId, String fromStatus, String toStatus, String actorType, UUID actorId, String reason) {
        jdbc.sql(INSERT_LOG)
                .param("caseId", caseId)
                .param("fromStatus", fromStatus)
                .param("toStatus", toStatus)
                .param("actorType", actorType)
                .param("actorId", actorId)
                .param("reason", reason)
                .update();
    }

    public Optional<CaseRow> find(UUID id) {
        return jdbc.sql(FIND).param("id", id).query(CASE_MAPPER).optional();
    }

    public List<ItemRow> findItems(UUID caseId) {
        return jdbc.sql(FIND_ITEMS).param("caseId", caseId).query(ITEM_MAPPER).list();
    }

    public List<ItemRow> findItemsByCases(List<UUID> caseIds) {
        return jdbc.sql(FIND_ITEMS_BY_CASES)
                .param("caseIds", caseIds)
                .query(ITEM_MAPPER)
                .list();
    }

    public List<CaseRow> listByBuyer(UUID buyerId, int limit) {
        return jdbc.sql(LIST_BY_BUYER)
                .param("buyerId", buyerId)
                .param("limit", limit)
                .query(CASE_MAPPER)
                .list();
    }

    public List<CaseRow> listByMerchant(UUID merchantId, int limit) {
        return jdbc.sql(LIST_BY_MERCHANT)
                .param("merchantId", merchantId)
                .param("limit", limit)
                .query(CASE_MAPPER)
                .list();
    }

    /** false = 状态已经不是 {@code expected}，别人先动了。 */
    public boolean advance(
            UUID id,
            String expected,
            String next,
            Instant deadlineAt,
            String deadlineActor,
            String deadlineAction,
            Instant approvedAt,
            Instant completedAt) {
        return jdbc.sql(UPDATE_STATUS)
                        .param("id", id)
                        .param("expected", expected)
                        .param("status", next)
                        .param("deadlineAt", RowMappers.toDb(deadlineAt))
                        .param("deadlineActor", deadlineActor)
                        .param("deadlineAction", deadlineAction)
                        .param("approvedAt", RowMappers.toDb(approvedAt))
                        .param("completedAt", RowMappers.toDb(completedAt))
                        .update()
                == 1;
    }

    public List<CaseRow> findDue(int limit) {
        return jdbc.sql(FIND_DUE).param("limit", limit).query(CASE_MAPPER).list();
    }

    public Optional<UUID> openCaseOfLine(UUID orderLineId) {
        return jdbc.sql(OPEN_CASE_OF_LINE)
                .param("orderLineId", orderLineId)
                .query((rs, row) -> rs.getObject("id", UUID.class))
                .optional();
    }

    public record NewCase(
            UUID id,
            String caseNo,
            UUID sellerOrderId,
            UUID merchantId,
            UUID buyerId,
            String type,
            String status,
            String reasonCode,
            String responsibility,
            long refundAmount,
            long shippingRefundAmount,
            String currency,
            Instant deadlineAt,
            String deadlineActor,
            String deadlineAction) {}

    public record CaseRow(
            UUID id,
            String caseNo,
            UUID sellerOrderId,
            UUID merchantId,
            UUID buyerId,
            String type,
            String status,
            String reasonCode,
            String responsibility,
            long refundAmount,
            long shippingRefundAmount,
            String currency,
            Instant deadlineAt,
            String deadlineActor,
            String deadlineAction,
            Instant approvedAt,
            Instant completedAt,
            Instant createdAt) {}

    public record ItemRow(UUID caseId, UUID orderLineId, int quantity, long refundAmount) {}
}
