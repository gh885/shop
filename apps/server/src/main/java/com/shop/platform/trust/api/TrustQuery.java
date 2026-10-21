package com.shop.platform.trust.api;

import java.util.UUID;

/**
 * 其它模块唯一的售卖资格入口。
 *
 * <p>catalog 发布商品、trade 下单都应该调这里，不许各自拼“商家状态 + 类目授权 + 资质”的条件。
 * 判定只读，不开事务，不产生副作用。
 */
public interface TrustQuery {

    SellDecision canSell(UUID merchantId, UUID categoryId, UUID brandId);
}
