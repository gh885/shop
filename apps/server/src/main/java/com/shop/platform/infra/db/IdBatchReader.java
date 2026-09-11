package com.shop.platform.infra.db;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

/**
 * 跨模块只读查询（各模块 api 包）共用的「按主键 IN 批查」管道：空集合短路、占位符展开、
 * 逐行收进 Map（缺失的 id 不在 Map 中）。
 *
 * <p>SQL 里用 {@code :ids} 标出 IN 的占位位置，如 {@code "... WHERE id IN (:ids)"}；
 * 拼占位符与收 Map 的样板只此一份，各 api 包只声明「查什么、怎么映射」。
 */
public final class IdBatchReader {

    private IdBatchReader() {}

    /**
     * 批查并收成 Map&lt;UUID, T&gt;。
     *
     * @param sql         含 {@code :ids} 占位标记的查询语句
     * @param ids         主键集合，null/空直接返回空 Map（不落一次多余查询）
     * @param keyMapper   从当前行取 Map 的键（主键列）
     * @param valueMapper 从当前行取 Map 的值（投影 record）
     */
    public static <T> Map<UUID, T> byIds(
            JdbcTemplate jdbc, String sql, Collection<UUID> ids, RowMapper<UUID> keyMapper, RowMapper<T> valueMapper) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        String placeholders = ids.stream().map(id -> "?").collect(Collectors.joining(","));
        return jdbc.query(
                sql.replace(":ids", placeholders),
                rs -> {
                    Map<UUID, T> map = new HashMap<>();
                    while (rs.next()) {
                        map.put(keyMapper.mapRow(rs, 0), valueMapper.mapRow(rs, 0));
                    }
                    return map;
                },
                ids.toArray());
    }
}
