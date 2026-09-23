package com.shop.platform.product.infra;

import com.shop.platform.infra.cache.CacheNames;
import com.shop.platform.infra.cache.CacheSpec;
import com.shop.platform.product.service.CategoryNode;
import java.util.UUID;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

/** 类目两份读的缓存登记：前台类目树整份一份，每个类目的可见子树各一份（键即类目 id）。 */
@Configuration(proxyBeanMethods = false)
public class ProductCacheConfig {

    @Bean
    CacheSpec categoryTreeCache(ObjectMapper objectMapper) {
        return CacheSpec.list(CacheNames.CATEGORY_TREE, objectMapper, CategoryNode.class);
    }

    @Bean
    CacheSpec categorySubtreeCache(ObjectMapper objectMapper) {
        return CacheSpec.set(CacheNames.CATEGORY_SUBTREE, objectMapper, UUID.class);
    }
}
