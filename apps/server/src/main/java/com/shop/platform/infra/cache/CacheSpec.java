package com.shop.platform.infra.cache;

import com.shop.platform.infra.db.JsonColumns;
import java.time.Duration;
import java.util.List;
import org.springframework.data.redis.serializer.JacksonJsonRedisSerializer;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.ObjectMapper;

/**
 * 一个缓存的形状：名字、值的精确类型、存活时间。
 *
 * <p>值类型逐缓存登记而不是用多态序列化器，是刻意排除两类事故：
 * {@code @class} 多态字段是反序列化攻击面，也让值在重构后无法读回；
 * 「字符串和对象混进同一个缓存」则会在读侧以 ClassCastException 的形式随机炸。
 * 泛型集合必须给 element type——裸 List 反序列化出来是 List&lt;Map&gt;，坏在调用方手里。
 *
 * <p>mapper 是全站共享的单例（Jackson 3 默认就不写多态 @class、读侧宽容未知字段），
 * 每个缓存各配一份反而让「同一个值两种 JSON 形状」成为可能。
 */
public record CacheSpec(String name, JavaType valueType, Duration ttl) {

    private static final ObjectMapper MAPPER = JsonColumns.mapper();

    public CacheSpec {
        if (name == null || name.isBlank() || valueType == null || ttl == null || ttl.isNegative() || ttl.isZero()) {
            throw new IllegalArgumentException("CacheSpec 不完整: " + name);
        }
    }

    /** 单对象缓存。 */
    public static CacheSpec single(String name, Class<?> type, Duration ttl) {
        return new CacheSpec(name, MAPPER.getTypeFactory().constructType(type), ttl);
    }

    /** 泛型 List 缓存。 */
    public static CacheSpec list(String name, Class<?> elementType, Duration ttl) {
        return new CacheSpec(name, MAPPER.getTypeFactory().constructCollectionType(List.class, elementType), ttl);
    }

    /** 该缓存的值序列化器。 */
    public JacksonJsonRedisSerializer<Object> serializer() {
        return new JacksonJsonRedisSerializer<>(MAPPER, valueType);
    }
}
