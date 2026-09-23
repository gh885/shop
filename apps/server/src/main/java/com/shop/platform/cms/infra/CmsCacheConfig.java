package com.shop.platform.cms.infra;

import com.shop.platform.cms.mapper.Banner;
import com.shop.platform.cms.mapper.NavEntry;
import com.shop.platform.cms.mapper.RecommendTab;
import com.shop.platform.infra.cache.CacheNames;
import com.shop.platform.infra.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

/**
 * CMS 前台三块读的缓存登记：名字与策略（TTL、键前缀）归 infra.cache，值类型由拥有这份数据的模块自己说。
 *
 * <p>一个缓存一个 bean：注入方是 {@code List<CacheSpec>}，按元素类型把各模块的贡献聚起来；一个 bean 交一份清单
 * 就得让清单本身再包一层类型，聚出来的会是错的形状。
 */
@Configuration(proxyBeanMethods = false)
public class CmsCacheConfig {

    @Bean
    CacheSpec cmsNavCache(ObjectMapper objectMapper) {
        return CacheSpec.list(CacheNames.CMS_NAV, objectMapper, NavEntry.class);
    }

    @Bean
    CacheSpec cmsBannerCache(ObjectMapper objectMapper) {
        return CacheSpec.list(CacheNames.CMS_BANNER, objectMapper, Banner.class);
    }

    @Bean
    CacheSpec cmsRecommendTabCache(ObjectMapper objectMapper) {
        return CacheSpec.list(CacheNames.CMS_RECOMMEND_TAB, objectMapper, RecommendTab.class);
    }
}
