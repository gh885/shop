package com.shop.platform.infra.db;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 跨 schema 只读批查助手 —— 模块隔离规则的技术落点（见根 AGENTS.md「模块隔离」）。
 *
 * <p>只做一件事：按主键 IN 点查其他模块 schema 的投影列，交回 Map 供内存拼装。
 * 刻意不提供的能力：JOIN、按非键条件过滤、写——越界查询在这里无处可写。
 *
 * <p>表名/列名以字面量显式传参，全局可 grep（搜 "FROM product." 即得全部对 product 的只读依赖），
 * 拆微服务时这些点查原地换成拥有方的批量 API 调用。
 */
@Component
@RequiredArgsConstructor
public class CrossSchemaReader {

    private final JdbcTemplate jdbc;

    /** 行投影函数：ResultSet 已定位到当前行；id 列恒在 SELECT 首列，可直接 getObject("id") */
    @FunctionalInterface
    public interface RowProjection<T> {

        T project(ResultSet rs) throws SQLException;
    }

    /** 按主键批查：SELECT id, columns... FROM table WHERE id IN (...) → Map(id → 投影行)，ids 为空返回空 Map */
    public <T> Map<UUID, T> byIds(
            String table, List<String> columns, Collection<UUID> ids, RowProjection<T> projection) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        String placeholders = ids.stream().map(id -> "?").collect(Collectors.joining(","));
        String sql =
                "SELECT id, " + String.join(", ", columns) + " FROM " + table + " WHERE id IN (" + placeholders + ")";
        return jdbc.query(
                sql,
                rs -> {
                    Map<UUID, T> map = new HashMap<>();
                    while (rs.next()) {
                        map.put(rs.getObject("id", UUID.class), projection.project(rs));
                    }
                    return map;
                },
                ids.toArray());
    }

    /** 单条点查，不存在返回 null */
    public <T> T byId(String table, List<String> columns, UUID id, RowProjection<T> projection) {
        return byIds(table, columns, List.of(id), projection).get(id);
    }

    /** 单字符串列糖衣（店名/手机号等展示字段拼装最常用），缺失的 id 不在 Map 中 */
    public Map<UUID, String> stringsByIds(String table, String column, Collection<UUID> ids) {
        return byIds(table, List.of(column), ids, rs -> rs.getString(column));
    }
}
