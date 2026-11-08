package com.shop.platform.notification.mapper;

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
 * {@code notification.message} 的全部 SQL。
 *
 * <p>买家读恒绑 {@code buyer_id}、商家读恒绑 {@code merchant_id}——收件人列就是归属列，
 * 与 CHECK 恰一非空联动，没有第三种读法。标已读是 CAS：{@code read_at IS NULL} 是前置条件，
 * 0 行 = 已读过或不存在，判决由服务层重读区分。
 */
@Mapper
public interface NotificationMapper {

    String COLUMNS =
            """
            id, recipient_type AS recipientType, buyer_id AS buyerId, merchant_id AS merchantId,
            type, CAST(params AS text) AS paramsJson, link, read_at AS readAt, created_at AS createdAt
            """;

    /** 插入一条通知。事件由消费侧 inbox 挡重，这里不需要唯一索引兜底。 */
    @Insert(
            """
            INSERT INTO notification.message
                (recipient_type, buyer_id, merchant_id, type, params, link)
            VALUES (#{r.recipientType}, #{r.buyerId}, #{r.merchantId}, #{r.type},
                    CAST(#{r.paramsJson} AS jsonb), #{r.link})
            """)
    int insert(@Param("r") NewMessage row);

    /** 收件人两列恰好一个非空（CHECK 守着），参数形状与迁移的 ck_message_recipient 对齐。 */
    record NewMessage(
            String recipientType, UUID buyerId, UUID merchantId, String type, String paramsJson, String link) {}

    // ── 读 ───────────────────────────────────────────────────────────────────

    /** 买家取一条自己的通知（标已读前核归属）。 */
    @Select("SELECT " + COLUMNS + " FROM notification.message WHERE id = #{id} AND buyer_id = #{buyerId}")
    Optional<NotificationRow> findForBuyer(@Param("id") UUID id, @Param("buyerId") UUID buyerId);

    /** 商家取一条自己的通知。 */
    @Select("SELECT " + COLUMNS + " FROM notification.message WHERE id = #{id} AND merchant_id = #{merchantId}")
    Optional<NotificationRow> findForMerchant(@Param("id") UUID id, @Param("merchantId") UUID merchantId);

    /** 买家通知列表，cursor 是 (created_at, id)。 */
    // 首段必须是普通字符串：文本块会剥掉行尾空格，"SELECT " 尾空格一剥就成了 SELECTid
    @Select(
            "<script>\nSELECT " + COLUMNS
                    + """
              FROM notification.message
             WHERE buyer_id = #{buyerId}
               <if test="cursorAt != null">
                  AND (created_at, id) &lt; (#{cursorAt}, #{cursorId})
               </if>
             ORDER BY created_at DESC, id DESC
             LIMIT #{limit}
            </script>
            """)
    List<NotificationRow> pageForBuyer(
            @Param("buyerId") UUID buyerId,
            @Param("cursorAt") Instant cursorAt,
            @Param("cursorId") UUID cursorId,
            @Param("limit") int limit);

    /** 商家通知列表，cursor 是 (created_at, id)。 */
    @Select(
            "<script>\nSELECT " + COLUMNS
                    + """
              FROM notification.message
             WHERE merchant_id = #{merchantId}
               <if test="cursorAt != null">
                  AND (created_at, id) &lt; (#{cursorAt}, #{cursorId})
               </if>
             ORDER BY created_at DESC, id DESC
             LIMIT #{limit}
            </script>
            """)
    List<NotificationRow> pageForMerchant(
            @Param("merchantId") UUID merchantId,
            @Param("cursorAt") Instant cursorAt,
            @Param("cursorId") UUID cursorId,
            @Param("limit") int limit);

    /** 买家未读计数（铃铛徽标）。 */
    @Select("SELECT count(*) FROM notification.message WHERE buyer_id = #{buyerId} AND read_at IS NULL")
    long countUnreadForBuyer(@Param("buyerId") UUID buyerId);

    /** 商家未读计数。 */
    @Select("SELECT count(*) FROM notification.message WHERE merchant_id = #{merchantId} AND read_at IS NULL")
    long countUnreadForMerchant(@Param("merchantId") UUID merchantId);

    // ── 写（CAS，0 行是判决）─────────────────────────────────────────────────

    /** 标已读一次。0 行 = 已读过或不存在（含别人的）。 */
    @Update(
            """
            UPDATE notification.message
               SET read_at = now(), updated_at = now()
             WHERE id = #{id} AND buyer_id = #{buyerId} AND read_at IS NULL
            """)
    int markReadForBuyer(@Param("id") UUID id, @Param("buyerId") UUID buyerId);

    /** 商家版标已读。 */
    @Update(
            """
            UPDATE notification.message
               SET read_at = now(), updated_at = now()
             WHERE id = #{id} AND merchant_id = #{merchantId} AND read_at IS NULL
            """)
    int markReadForMerchant(@Param("id") UUID id, @Param("merchantId") UUID merchantId);

    /** 买家全部已读。重复调用是 0 行空操作，幂等。 */
    @Update(
            """
            UPDATE notification.message
               SET read_at = now(), updated_at = now()
             WHERE buyer_id = #{buyerId} AND read_at IS NULL
            """)
    int markAllReadForBuyer(@Param("buyerId") UUID buyerId);

    /** 商家全部已读。 */
    @Update(
            """
            UPDATE notification.message
               SET read_at = now(), updated_at = now()
             WHERE merchant_id = #{merchantId} AND read_at IS NULL
            """)
    int markAllReadForMerchant(@Param("merchantId") UUID merchantId);
}
