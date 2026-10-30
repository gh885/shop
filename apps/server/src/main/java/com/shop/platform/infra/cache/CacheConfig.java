package com.shop.platform.infra.cache;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.support.NoOpCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.RedisSerializationContext;

/**
 * Redis 缓存装配。三个刻意的决定：
 *
 * <ul>
 *   <li><b>transactionAware</b>：写侧失效（{@code @CacheEvict}）推迟到事务提交之后。
 *       没有它，「改配置 → 提交前另一个请求把旧值写回缓存」的竞态会把脏数据钉住到 TTL 过期。
 *   <li><b>值类型逐缓存登记</b>（见 {@link CacheSpec}），共享层不 import 任何模块类型——
 *       各模块在自己的包里声明自己的 {@code CacheSpec} bean，这里只收集。
 *   <li><b>名单 fail-fast</b>：登记的 spec 与 {@link CacheNames#ALL} 双向比对，
 *       多一个少一个都启动失败，防「配了 spec 忘登名」和「登了名没配形状」两种半成品。
 * </ul>
 *
 * <p>{@code shop.cache.enabled=false} 退化成 NoOp——这是缓存故障时的线上逃生口
 * （fail-open：缓存层坏掉就直读库，业务不陪葬）。
 */
@Configuration
@EnableCaching
public class CacheConfig {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(CacheConfig.class);

    @Bean
    @ConditionalOnProperty(name = "shop.cache.enabled", matchIfMissing = true)
    public CacheManager redisCacheManager(RedisConnectionFactory factory, List<CacheSpec> specs) {
        assertRegistryComplete(specs);

        Map<String, RedisCacheConfiguration> configs = specs.stream()
                .collect(Collectors.toMap(CacheSpec::name, spec -> RedisCacheConfiguration.defaultCacheConfig()
                        .entryTtl(spec.ttl())
                        .disableCachingNullValues()
                        .serializeValuesWith(
                                RedisSerializationContext.SerializationPair.fromSerializer(spec.serializer()))));

        // SDR 4 的缓存写默认延迟/异步派发（AsyncCacheWriter）：evict 的 DEL 异步生效，
        // 读紧跟着写会出现「拿到刚失效前的旧值」的窗口。这个栈里读写紧跟（改配置 → 立即浏览），
        // 异步收益为零、一致性代价真实——immediateWrites 钉死同步。
        var cacheWriter = org.springframework.data.redis.cache.RedisCacheWriter.create(factory, configurer -> configurer
                .batchStrategy(org.springframework.data.redis.cache.BatchStrategies.keys())
                .immediateWrites());
        return RedisCacheManager.builder(cacheWriter)
                .transactionAware()
                .withInitialCacheConfigurations(configs)
                .build();
    }

    @Bean
    @ConditionalOnProperty(name = "shop.cache.enabled", havingValue = "false")
    public CacheManager noOpCacheManager() {
        log.warn("缓存已通过 shop.cache.enabled=false 显式关闭——所有读直打库");
        return new NoOpCacheManager();
    }

    private void assertRegistryComplete(List<CacheSpec> specs) {
        var specNames = specs.stream().map(CacheSpec::name).collect(Collectors.toSet());
        if (!specNames.equals(CacheNames.ALL)) {
            var missing = new java.util.LinkedHashSet<>(CacheNames.ALL);
            missing.removeAll(specNames);
            var unknown = new java.util.LinkedHashSet<>(specNames);
            unknown.removeAll(CacheNames.ALL);
            throw new IllegalStateException("缓存登记不完整。只在 CacheNames 里: " + missing + "；只配了 spec: " + unknown);
        }
    }
}
