package com.shop.platform.infra.cache;

import java.util.List;
import java.util.Set;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.ObjectMapper;

/**
 * 一个缓存的名字与值类型。
 *
 * <p>值类型由<b>拥有这份数据的模块</b>各自声明（见各模块 {@code <module>.infra} 里的 CacheSpec bean）：共享层
 * {@link CacheConfig} 只定策略（键前缀、TTL、序列化口径），不认识任何模块的实体——它一旦 import 得动
 * {@code cms.mapper.NavEntry}，「谁都能往谁身上挂依赖」这条边界就漏了（Spring Modulith 的架构校验会判违规）。
 */
public record CacheSpec(String name, JavaType valueType) {

    public CacheSpec {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("缓存名不能为空");
        }
        if (valueType == null) {
            throw new IllegalArgumentException("缓存 " + name + " 必须给出值类型");
        }
    }

    /** 值是 {@code List<元素>} 的读（列表类缓存全是这个形状） */
    public static CacheSpec list(String name, ObjectMapper objectMapper, Class<?> elementType) {
        return new CacheSpec(name, objectMapper.getTypeFactory().constructCollectionType(List.class, elementType));
    }

    /** 值是 {@code Set<元素>} 的读；落回的是 HashSet——只够当集合用，展开顺序不保（消费方拿它进 SQL 的 IN 列表，顺序由 ORDER BY 定） */
    public static CacheSpec set(String name, ObjectMapper objectMapper, Class<?> elementType) {
        return new CacheSpec(name, objectMapper.getTypeFactory().constructCollectionType(Set.class, elementType));
    }

    /** 值就是一个具体对象（单条点查的缓存） */
    public static CacheSpec single(String name, ObjectMapper objectMapper, Class<?> type) {
        return new CacheSpec(name, objectMapper.getTypeFactory().constructType(type));
    }
}
