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

    record ShopRow(UUID id, String name) {}
}
