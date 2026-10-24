package com.shop.platform.returns.mapper;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

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
@Mapper
public interface CaseMapper {

    /** 单条 SELECT 复用的列清单；列名 snake 直配 record 组件（下划线剥除 + 忽略大小写）。 */
    String COLUMNS =
            """
            id, case_no, seller_order_id, merchant_id, buyer_id, type, status, reason_code, responsibility,
            refund_amount, shipping_refund_amount, currency, deadline_at, deadline_actor, deadline_action,
            approved_at, completed_at, created_at
            """;

    @Insert(
            """
            INSERT INTO returns.after_sale_case
                (id, case_no, seller_order_id, merchant_id, buyer_id, type, status, reason_code,
                 responsibility, refund_amount, shipping_refund_amount, currency,
                 deadline_at, deadline_actor, deadline_action)
            VALUES (#{row.id}, #{row.caseNo}, #{row.sellerOrderId}, #{row.merchantId}, #{row.buyerId}, #{row.type}, #{row.status}, #{row.reasonCode},
                    #{row.responsibility}, #{row.refundAmount}, #{row.shippingRefundAmount}, #{row.currency},
                    #{row.deadlineAt}, #{row.deadlineActor}, #{row.deadlineAction})
            """)
    void insertCase(@Param("row") NewCase row);

    @Insert(
            """
            INSERT INTO returns.case_item (case_id, order_line_id, quantity, refund_amount)
            VALUES (#{caseId}, #{orderLineId}, #{quantity}, #{refundAmount})
            """)
    void insertItem(
            @Param("caseId") UUID caseId,
            @Param("orderLineId") UUID orderLineId,
            @Param("quantity") int quantity,
            @Param("refundAmount") long refundAmount);

    @Insert(
            """
            INSERT INTO returns.case_log (case_id, from_status, to_status, actor_type, actor_id, reason)
            VALUES (#{caseId}, #{fromStatus}, #{toStatus}, #{actorType}, #{actorId}, #{reason})
            """)
    void insertLog(
            @Param("caseId") UUID caseId,
            @Param("fromStatus") String fromStatus,
            @Param("toStatus") String toStatus,
            @Param("actorType") String actorType,
            @Param("actorId") UUID actorId,
            @Param("reason") String reason);

    @Select("SELECT " + COLUMNS + " FROM returns.after_sale_case WHERE id = #{id}")
    Optional<CaseRow> find(@Param("id") UUID id);

    // 投影列必须带 case_id：ItemRow 有这个字段，少选一列构造映射对不上，
    // 单案查询当场炸——这个坑踩过一次（apply 落库后的视图装配从没被集成测试跑到）
    @Select(
            """
            SELECT case_id, order_line_id, quantity, refund_amount
              FROM returns.case_item
             WHERE case_id = #{caseId}
             ORDER BY order_line_id
            """)
    List<ItemRow> findItems(@Param("caseId") UUID caseId);

    /** 一批 case 的全部明细，一次取回。列表页用它，不再每个 case 发一条查询。 */
    @Select(
            """
            <script>
            SELECT case_id, order_line_id, quantity, refund_amount
              FROM returns.case_item
             WHERE case_id IN
            <foreach collection="caseIds" item="caseId" open="(" separator="," close=")">#{caseId}</foreach>
             ORDER BY case_id, order_line_id
            </script>
            """)
    List<ItemRow> findItemsByCases(@Param("caseIds") List<UUID> caseIds);

    /**
     * 列表查询按条件拼：类型/状态过滤是「有这个参数才多一段 AND」，游标是行值比较
     * {@code (created_at, id) < (:cursorAt, :cursorId)}——只按 created_at 比较会串同一毫秒的行，
     * id 是平局裁决。
     *
     * <p>{@code ${owner}} 是内置的归属列名（buyer_id / merchant_id），不是外部输入，替换是安全的。
     * SQL 拼进 text block 会剥行尾空格，所以列清单用普通字符串常量接。
     */
    String LIST_SQL = "<script>\nSELECT " + COLUMNS
            + """

              FROM returns.after_sale_case
             WHERE ${owner} = #{ownerId}
            <if test="type != null">   AND type = #{type}</if>
            <if test="status != null"> AND status = #{status}</if>
            <if test="cursorAt != null"> AND (created_at, id) &lt; (#{cursorAt}, #{cursorId})</if>
             ORDER BY created_at DESC, id DESC
             LIMIT #{limit}
            </script>
            """;

    @Select(LIST_SQL)
    List<CaseRow> listByOwner(
            @Param("owner") String ownerColumn,
            @Param("ownerId") UUID ownerId,
            @Param("type") String type,
            @Param("status") String status,
            @Param("cursorAt") Instant cursorAt,
            @Param("cursorId") UUID cursorId,
            @Param("limit") int limit);

    /**
     * @param limit 传调用方的页大小 + 1：多取一条只为判断有没有下一页，下一页游标取本页最后一行的
     *             {@code (createdAt, id)}。{@code type}/{@code status}/{@code cursorAt} 为 null 表示不过滤/第一页。
     */
    default List<CaseRow> listByBuyer(
            UUID buyerId, String type, String status, Instant cursorAt, UUID cursorId, int limit) {
        return listByOwner("buyer_id", buyerId, type, status, cursorAt, cursorId, limit);
    }

    default List<CaseRow> listByMerchant(
            UUID merchantId, String type, String status, Instant cursorAt, UUID cursorId, int limit) {
        return listByOwner("merchant_id", merchantId, type, status, cursorAt, cursorId, limit);
    }

    /**
     * 状态推进。{@code approved_at} / {@code completed_at} 用 COALESCE 保留旧值——
     * 写 null 不等于"清空"，而是"这次不动它"。返回 false = 状态不是 {@code expected}，别人先动了。
     */
    @Update(
            """
            UPDATE returns.after_sale_case
               SET status = #{next},
                   deadline_at = CAST(#{deadlineAt} AS timestamptz),
                   deadline_actor = #{deadlineActor},
                   deadline_action = #{deadlineAction},
                   approved_at = COALESCE(CAST(#{approvedAt} AS timestamptz), approved_at),
                   completed_at = COALESCE(CAST(#{completedAt} AS timestamptz), completed_at)
             WHERE id = #{id} AND status = #{expected}
            """)
    boolean advance(
            @Param("id") UUID id,
            @Param("expected") String expected,
            @Param("next") String next,
            @Param("deadlineAt") Instant deadlineAt,
            @Param("deadlineActor") String deadlineActor,
            @Param("deadlineAction") String deadlineAction,
            @Param("approvedAt") Instant approvedAt,
            @Param("completedAt") Instant completedAt);

    /** 超时扫描只扫非终态；{@code disputed} 的时钟归 dispute，不在这里推进。 */
    @Select(
            "SELECT " + COLUMNS
                    + """
             FROM returns.after_sale_case
             WHERE deadline_at IS NOT NULL AND deadline_at < now()
               AND status NOT IN ('completed', 'cancelled', 'rejected', 'disputed')
             ORDER BY deadline_at
             LIMIT #{limit}
            """)
    List<CaseRow> findDue(@Param("limit") int limit);

    /** 这个订单行有没有未终态的 case。提交前必须为空，否则会退两次。 */
    @Select(
            """
            SELECT c.id
              FROM returns.case_item i
              JOIN returns.after_sale_case c ON c.id = i.case_id
             WHERE i.order_line_id = #{orderLineId}
               AND c.status NOT IN ('completed', 'cancelled', 'rejected')
             LIMIT 1
            """)
    Optional<UUID> openCaseOfLine(@Param("orderLineId") UUID orderLineId);

    /**
     * 事务级咨询锁。上面那条检查挡不住并发：两个请求同时查到"没有未终态 case"，然后都插入。
     * 锁的键是订单行 id，粒度足够细，不会互相挡。函数返回 void 列，按字符串收（null）丢弃。
     */
    default void lockLine(UUID orderLineId) {
        lockLineRow(orderLineId.toString());
    }

    @Select("SELECT pg_advisory_xact_lock(hashtext(#{key}))")
    String lockLineRow(@Param("key") String key);

    record NewCase(
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

    record CaseRow(
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

    record ItemRow(UUID caseId, UUID orderLineId, int quantity, long refundAmount) {}
}
