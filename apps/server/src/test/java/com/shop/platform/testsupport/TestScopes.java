package com.shop.platform.testsupport;

import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.security.AccessScope;
import java.util.Collection;
import java.util.Set;
import java.util.UUID;

/** 测试用的凭据工厂：构造「某个商家的、授权了某些店」的卖家身份。 */
public final class TestScopes {

    private TestScopes() {}

    /**
     * @param merchantId 商家归属
     * @param shopIds 操作人的店铺授权——空集就是一个店都碰不了，不是"全部店"
     */
    public static AccessScope.Seller seller(UUID merchantId, Collection<UUID> shopIds) {
        return seller(merchantId, shopIds, null);
    }

    /**
     * @param refundCap 退款上限（分）；null = 不限。测退款上限约束时用这个重载
     */
    public static AccessScope.Seller seller(UUID merchantId, Collection<UUID> shopIds, Long refundCap) {
        return new AccessScope.Seller(Ids.newId(), merchantId, Set.copyOf(shopIds), refundCap);
    }
}
