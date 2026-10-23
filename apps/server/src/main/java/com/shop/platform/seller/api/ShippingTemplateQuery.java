package com.shop.platform.seller.api;

import java.util.Optional;
import java.util.UUID;

/**
 * 运费规则的读取入口。算价取模板只走这里。
 *
 * <p>为什么放在 {@code seller} 而不是 {@code pricing}：模板是**店铺配置**，{@code shop_id} 指向的
 * 就是 seller 的表。pricing 只拿值对象自己算钱——它需要的不是"模板"这个实体，是"这家店怎么收费"这个事实。
 */
public interface ShippingTemplateQuery {

    /**
     * 取店铺当前启用的模板。
     *
     * <p>用 {@code shopId} 而不是 {@code merchantId}：模板归店铺，一个商家开两家店就是两套模板、
     * 两笔运费。{@code shopId} 由 catalog 的 offer 带过来，算价不需要知道商家和店铺的映射关系。
     *
     * <p>返回空 = 这家店没配模板，或者模板被归档了。调用方决定怎么报错，这里不替它决定。
     */
    Optional<FreightRule> activeFor(UUID shopId);
}
