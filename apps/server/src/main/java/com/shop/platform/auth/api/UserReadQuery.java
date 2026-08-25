package com.shop.platform.auth.api;

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
 * 用户只读查询（跨模块消费）：本模块 schema 的投影列点查，禁止 JOIN 与写。
 */
@Component
@RequiredArgsConstructor
public class UserReadQuery {

    private final JdbcTemplate jdbc;

    /** userId → 手机号（成员列表/审核队列等展示字段拼装），缺失的 id 不在 Map 中 */
    public Map<UUID, String> phonesByIds(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        String placeholders = ids.stream().map(id -> "?").collect(Collectors.joining(","));
        return jdbc.query(
                "SELECT id, phone FROM auth.users WHERE id IN (" + placeholders + ")",
                rs -> {
                    Map<UUID, String> map = new HashMap<>();
                    while (rs.next()) {
                        map.put(rs.getObject("id", UUID.class), rs.getString("phone"));
                    }
                    return map;
                },
                ids.toArray());
    }

    /** 按手机号查 userId（auth.users 全局唯一手机号），未注册返回 null。非主键点查，保持显式 */
    public UUID findIdByPhone(String phone) {
        List<UUID> ids = jdbc.query(
                "SELECT id FROM auth.users WHERE phone = ?", (rs, i) -> rs.getObject("id", UUID.class), phone);
        return ids.isEmpty() ? null : ids.getFirst();
    }
}
