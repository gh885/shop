package com.shop.platform.trust.mapper;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * {@code trust.violation_clue} 的读写。线索是流水，只增不改——
 * 状态推进（acknowledged / dismissed）是运营动作，走条件更新。
 */
@Mapper
public interface TrustClueMapper {

    /** 不带冲突目标：任何唯一键冲突（uq_clue_order）都当"来过了"。 */
    @Insert(
            """
            INSERT INTO trust.violation_clue (id, kind, merchant_id, seller_order_id, occurred_at, detail)
            VALUES (#{id}, #{kind}, #{merchantId}, #{sellerOrderId},
                    #{occurredAt}, #{detail})
            ON CONFLICT DO NOTHING
            """)
    void insert(
            @Param("id") UUID id,
            @Param("kind") String kind,
            @Param("merchantId") UUID merchantId,
            @Param("sellerOrderId") UUID sellerOrderId,
            @Param("occurredAt") Instant occurredAt,
            @Param("detail") String detail);

    /** 待处理（open）在前，其余按时间倒序——盯告警的人先看最要紧的。 */
    @Select(
            """
            SELECT id, kind, merchant_id, seller_order_id, occurred_at, detail, status, created_at
              FROM trust.violation_clue
             WHERE (#{status}::text IS NULL OR status = #{status})
             ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC
             LIMIT #{limit}
            """)
    List<ClueRow> find(@Param("status") String status, @Param("limit") int limit);

    public record ClueRow(
            UUID id,
            String kind,
            UUID merchantId,
            UUID sellerOrderId,
            Instant occurredAt,
            String detail,
            String status,
            Instant createdAt) {}
}
