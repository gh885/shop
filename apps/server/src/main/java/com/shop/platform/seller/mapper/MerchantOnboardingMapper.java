package com.shop.platform.seller.mapper;

import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 入驻与店铺生命周期的 SQL。merchant / operator / shop / onboarding 四张表同事务写，这里只放语句。 */
@Mapper
public interface MerchantOnboardingMapper {

    @Insert("""
            INSERT INTO seller.merchant (id, name) VALUES (#{id}, #{name})
            """)
    int insertMerchant(@Param("id") UUID id, @Param("name") String name);

    @Insert(
            """
            INSERT INTO seller.operator (id, merchant_id, login_name, password_hash, display_name, is_primary)
            VALUES (#{id}, #{merchantId}, #{loginName}, #{passwordHash}, #{displayName}, true)
            """)
    int insertPrimaryOperator(
            @Param("id") UUID id,
            @Param("merchantId") UUID merchantId,
            @Param("loginName") String loginName,
            @Param("passwordHash") String passwordHash,
            @Param("displayName") String displayName);

    @Insert(
            """
            INSERT INTO seller.shop (id, merchant_id, name) VALUES (#{id}, #{merchantId}, #{name})
            """)
    int insertShop(@Param("id") UUID id, @Param("merchantId") UUID merchantId, @Param("name") String name);

    @Insert("""
            INSERT INTO seller.onboarding (merchant_id) VALUES (#{merchantId})
            """)
    int insertOnboarding(@Param("merchantId") UUID merchantId);

    /** 商家名批查（治理审核队列拼主体名称用）。查不到的不占键位，调用方兜底。 */
    @Select(
            """
            <script>
            SELECT id, name
              FROM seller.merchant
             WHERE id IN
               <foreach collection="merchantIds" item="mid" open="(" separator="," close=")">#{mid}</foreach>
            </script>
            """)
    java.util.List<MerchantNameRow> findMerchantNames(@Param("merchantIds") java.util.Collection<UUID> merchantIds);

    record MerchantNameRow(UUID id, String name) {}

    /** 商家的启用中店铺。当前口径一家店一个账号，取最早创建的一家。 */
    @Select(
            """
            SELECT id, name
              FROM seller.shop
             WHERE merchant_id = #{merchantId} AND status = 'active'
             ORDER BY created_at
             LIMIT 1
            """)
    Optional<ShopRow> findActiveShop(@Param("merchantId") UUID merchantId);

    record ShopRow(UUID id, String name) {}

    /** 改名。0 行 = 店不存在或已关闭（closed 是终态，名字改不动）。 */
    @Update("UPDATE seller.shop SET name = #{name} WHERE id = #{shopId} AND status = 'active'")
    int renameShop(@Param("shopId") UUID shopId, @Param("name") String name);

    /** 关店 CAS。0 行 = 已关闭或不存在；closed 是终态，没有重开路径。 */
    @Update("UPDATE seller.shop SET status = 'closed' WHERE id = #{shopId} AND status = 'active'")
    int closeShop(@Param("shopId") UUID shopId);

    /** 入驻投影点查（重提闸门与卖家端展示）。 */
    @Select("SELECT status FROM seller.onboarding WHERE merchant_id = #{merchantId}")
    Optional<String> onboardingStatus(@Param("merchantId") UUID merchantId);

    /** 重提：投影 rejected → pending。0 行 = 不在被拒态，调用方据此拒绝。 */
    @Update("UPDATE seller.onboarding SET status = 'pending', reject_reason = NULL, updated_at = now()"
            + " WHERE merchant_id = #{merchantId} AND status = 'rejected'")
    int resubmitOnboarding(@Param("merchantId") UUID merchantId);

    /** 审核结论回写（governance 在其事务里经 OnboardingCommand 调用）：无状态前置，重复裁决以最后一次为准。 */
    @Update(
            "UPDATE seller.onboarding SET status = #{status}, reject_reason = #{reason}, decided_at = now(), updated_at = now()"
                    + " WHERE merchant_id = #{merchantId}")
    int decideOnboarding(
            @Param("merchantId") UUID merchantId, @Param("status") String status, @Param("reason") String reason);
}
