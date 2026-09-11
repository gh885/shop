package com.shop.platform.account.api;

import com.shop.platform.infra.db.IdBatchReader;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
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
        return IdBatchReader.byIds(
                jdbc,
                "SELECT id, phone FROM account.users WHERE id IN (:ids)",
                ids,
                (rs, i) -> rs.getObject("id", UUID.class),
                (rs, i) -> rs.getString("phone"));
    }

    /** 按手机号查 userId（account.users 全局唯一手机号），未注册返回 empty —— api 包缺席语义统一走 Optional */
    public Optional<UUID> findIdByPhone(String phone) {
        List<UUID> ids = jdbc.query(
                "SELECT id FROM account.users WHERE phone = ?", (rs, i) -> rs.getObject("id", UUID.class), phone);
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.getFirst());
    }
}
