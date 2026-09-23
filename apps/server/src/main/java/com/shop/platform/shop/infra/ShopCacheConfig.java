package com.shop.platform.shop.infra;

import com.shop.platform.infra.cache.CacheNames;
import com.shop.platform.infra.cache.CacheSpec;
import com.shop.platform.shop.mapper.Shop;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

/** 店铺公开信息那份读的缓存登记（键即店铺 id；只有 ACTIVE 行会入缓存，见 ACC-05）。 */
@Configuration(proxyBeanMethods = false)
public class ShopCacheConfig {

    @Bean
    CacheSpec shopPublicCache(ObjectMapper objectMapper) {
        return CacheSpec.single(CacheNames.SHOP_PUBLIC, objectMapper, Shop.class);
    }
}
