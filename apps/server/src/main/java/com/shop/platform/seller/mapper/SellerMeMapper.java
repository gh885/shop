package com.shop.platform.seller.mapper;

import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 「我的店」点查：一个商家名下取启用中的店铺，给卖家端的身份端点用。 */
@Mapper
public interface SellerMeMapper {

    /**
     * 商家的启用中店铺。按创建时间取最早的一家——一家店一个账号是当前口径，
     * 若将来同商家多店，这里要改成显式选择（不能静默取第一家）。
     */
    @Select(
            """
            SELECT id, name
              FROM seller.shop
             WHERE merchant_id = #{merchantId} AND status = 'active'
             ORDER BY created_at
             LIMIT 1
            """)
    Optional<ShopRow> findActiveShop(@Param("merchantId") UUID merchantId);

    /** 主/子账号判定：SellerMe 带给前端做子账号管理入口的门禁 */
    @Select("SELECT is_primary FROM seller.operator WHERE id = #{operatorId}")
    Optional<Boolean> isPrimary(@Param("operatorId") UUID operatorId);

    /**
     * 入驻审核状态（governance.seller_profile 的投影，见 seller.onboarding）。
     * 没有行的只有种子商家——注册流程都会落一行 pending。
     */
    @Select("SELECT status FROM seller.onboarding WHERE merchant_id = #{merchantId}")
    Optional<String> onboardingStatus(@Param("merchantId") UUID merchantId);

    /** 被拒理由，与状态同源同查询口径；未被拒时为空。 */
    @Select("SELECT reject_reason FROM seller.onboarding WHERE merchant_id = #{merchantId}")
    Optional<String> onboardingRejectReason(@Param("merchantId") UUID merchantId);

    record ShopRow(UUID id, String name) {}
}
