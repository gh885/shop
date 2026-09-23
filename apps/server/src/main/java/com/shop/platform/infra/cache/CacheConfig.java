package com.shop.platform.infra.cache;

import java.time.Duration;
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
import org.springframework.data.redis.serializer.JacksonJsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.ObjectMapper;

/**
 * 读缓存的策略层：Redis 背书，键前缀 / TTL / 序列化口径都在这里定；**缓存哪些数据、值是什么类型，由各模块
 * 自己以 {@link CacheSpec} bean 声明**（名单汇总见 {@link CacheNames}）。
 *
 * <p><b>为什么不选进程内缓存</b>：本服务按多实例部署算，各节点的本地缓存互不知情，写侧的主动失效只打中一个节点，
 * 其余节点要熬到 TTL——「运营改完首页立刻生效」正是这个缝。Redis 只有一份，失效即全量生效。
 *
 * <p><b>TTL 是陈旧上限，不是新鲜度目标</b>：新鲜度由写侧失效负责，失效又推迟到事务提交之后
 * （{@code setTransactionAware}），所以正常路径上「改完下一请求就生效」是准的。TTL 只兜一类漏网：
 * 没接上失效的写路径。取分钟级而不是「反正会失效」的小时级。
 *
 * <p><b>值序列化按缓存逐个给定具体类型</b>，不开 Jackson 的多态类型标记：缓存值的类型在写它的那行代码里就已确定，
 * 带 {@code @class} 既给 Redis 里的字节开了多态反序列化的面，又换不来灵活性。没登记值类型的名字一律不缓存
 * （{@code disableCreateOnMissingCache}）而不是退回默认序列化，且启动时就核对登记是否齐（见 {@link #cacheManager}）。
 *
 * <p>{@code shop.cache.enabled=false} 时全套缓存注解退化为空转（{@link NoOpCacheManager}），测试上下文因此
 * 不需要 Redis，也不会跨用例串味。
 */
@Configuration(proxyBeanMethods = false)
@EnableCaching
public class CacheConfig {

    /** 陈旧上限：见类注释——它是兜底，不是新鲜度口径 */
    private static final Duration TTL = Duration.ofMinutes(5);

    @Bean
    @ConditionalOnProperty(prefix = "shop.cache", name = "enabled", havingValue = "true", matchIfMissing = true)
    RedisCacheManager cacheManager(
            RedisConnectionFactory connectionFactory, ObjectMapper objectMapper, List<CacheSpec> specs) {
        ObjectMapper reader = lenientReader(objectMapper);
        Map<String, RedisCacheConfiguration> configurations = specs.stream()
                .collect(Collectors.toMap(CacheSpec::name, spec -> serializeWith(reader, spec.valueType())));
        // 登记不齐就是接错了（要么名字写错、要么模块那份 spec 忘了提交）：启动即失败，好过线上静默不缓存
        if (!configurations.keySet().equals(CacheNames.ALL)) {
            throw new IllegalStateException("读缓存登记与名单不一致，期望 " + CacheNames.ALL + "，实际 " + configurations.keySet());
        }
        RedisCacheManager cacheManager = RedisCacheManager.builder(connectionFactory)
                .initialCacheNames(CacheNames.ALL)
                // 缓存名没登记值类型就是不缓存，而不是悄悄用默认序列化把值写进 Redis（那会在库里留下读不出来的字节）
                .disableCreateOnMissingCache()
                .withInitialCacheConfigurations(configurations)
                .build();
        // 写侧的失效/写入推迟到事务提交之后：否则「提交前就 evict」会被并发读用旧值重新填回，一 stale 就是一个 TTL
        cacheManager.setTransactionAware(true);
        return cacheManager;
    }

    @Bean
    @ConditionalOnProperty(prefix = "shop.cache", name = "enabled", havingValue = "false")
    CacheManager noOpCacheManager() {
        return new NoOpCacheManager();
    }

    /**
     * 缓存专用的 mapper 副本：读回时放过「JSON 里有、bean 里没」的属性（包可见，好让
     * {@code CacheValueRoundTripTest} 用同一个口径验往返）。
     *
     * <p>实体上的派生 getter（{@code Banner.isTimeRangeValid()} 这类）会被当成属性写进字节，再读回来时按 web 那套严格
     * 口径就是 500——缓存把自己的数据读不出来，这不能怪缓存。顺带换来滚动发布的一条命：旧版本写的字节，新版本把字段删了也还读得出来，
     * 不必先清 Redis 再发布。只改这份副本，不动全局 mapper（外部入参的契约漂移还要靠严格口径报出来）。
     */
    static ObjectMapper lenientReader(ObjectMapper objectMapper) {
        return objectMapper
                .rebuild()
                .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .build();
    }

    /**
     * 单个缓存的键值字节口径：键用可读字符串（排障时 redis-cli 直接看得出是哪条），值用模块声明的具体类型。
     *
     * <p>键前缀取 {@code cache:<名字>:}——冒号分段让 Redis 里按前缀扫得到整组，{@code cache} 段把它和业务的
     * 会话/限流键隔开，避免清缓存时误伤。
     */
    private static RedisCacheConfiguration serializeWith(ObjectMapper objectMapper, JavaType valueType) {
        return RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(TTL)
                .disableCachingNullValues()
                .computePrefixWith(name -> "cache:" + name + ":")
                .serializeKeysWith(
                        RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(
                        new JacksonJsonRedisSerializer<>(objectMapper, valueType)));
    }
}
