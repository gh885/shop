package com.shop.platform.governance.mapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 入驻审核的 SQL。审核状态机（applied → active/rejected）住 governance.seller_profile，这里只放语句。 */
@Mapper
public interface GovernanceOnboardingMapper {

    /** 注册事件落地：建档案进待审队列。重复投递（ON CONFLICT）静默忽略——档案已存在就不是本条事件的事了。 */
    @Insert(
            """
            INSERT INTO governance.seller_profile (merchant_id) VALUES (#{merchantId})
            ON CONFLICT (merchant_id) DO NOTHING
            """)
    int insertProfileIfAbsent(@Param("merchantId") UUID merchantId);

    /** 通过即生效：applied → active，同时落 joined_at——「什么时候入驻」是审核通过那一刻定义的。 */
    @Update("UPDATE governance.seller_profile SET status = 'active', joined_at = now(), updated_at = now()"
            + " WHERE merchant_id = #{merchantId} AND status = 'applied'")
    int approveProfile(@Param("merchantId") UUID merchantId);

    /** 驳回：applied → rejected。理由走事件回给卖家侧，不落本表——本表没有理由列。 */
    @Update("UPDATE governance.seller_profile SET status = 'rejected', updated_at = now()"
            + " WHERE merchant_id = #{merchantId} AND status = 'applied'")
    int rejectProfile(@Param("merchantId") UUID merchantId);

    /** 重提：rejected → applied。0 行 = 已被处理过（重投）或不在被拒态，幂等忽略。 */
    @Update("UPDATE governance.seller_profile SET status = 'applied', updated_at = now()"
            + " WHERE merchant_id = #{merchantId} AND status = 'rejected'")
    int reopenProfile(@Param("merchantId") UUID merchantId);

    @Select("SELECT status FROM governance.seller_profile WHERE merchant_id = #{merchantId}")
    Optional<String> profileStatus(@Param("merchantId") UUID merchantId);

    /**
     * 审核队列。FIFO，先提交的先审；status 传了只看那一档。一次最多 {@code QUEUE_LIMIT} 条——
     * 审核靠人处理，拉一万条没有意义。
     */
    @Select(
            """
            SELECT merchant_id, status, level, joined_at, updated_at
              FROM governance.seller_profile
             WHERE (CAST(#{status} AS text) IS NULL OR status = #{status})
             ORDER BY updated_at
             LIMIT #{limit}
            """)
    List<ProfileRow> listProfiles(@Param("status") String status, @Param("limit") int limit);

    record ProfileRow(
            UUID merchantId,
            String status,
            String level,
            java.time.OffsetDateTime joinedAt,
            java.time.OffsetDateTime updatedAt) {}
}
