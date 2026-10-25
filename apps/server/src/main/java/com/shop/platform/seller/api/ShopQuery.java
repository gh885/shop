package com.shop.platform.seller.api;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * 店铺点查。算价给结算页按店铺分组出明细时取店名用。
 *
 * <p>返回空 = 没有这家店。店名是展示信息不是金额输入，缺了不该拦算价——调用方自行兜底。
 */
public interface ShopQuery {

    /** 店铺名点查 */
    Optional<String> nameOf(UUID shopId);

    /**
     * 店铺名批查，读侧拼装（购物车按店分组）用。查不到的键不在返回 Map 里，
     * 调用方兜底展示，不报错。
     */
    Map<UUID, String> namesByIds(Collection<UUID> shopIds);
}
