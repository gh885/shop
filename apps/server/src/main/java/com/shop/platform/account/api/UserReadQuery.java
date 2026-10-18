package com.shop.platform.account.api;

import com.shop.platform.account.model.UserStatus;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 用户只读查询（跨模块消费）：本模块 schema 的投影列点查，禁止 JOIN 与写。
 */
@Component
@RequiredArgsConstructor
public class UserReadQuery {

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;

    /** userId → 手机号（成员列表/审核队列等批量拼装，出参一律先过 PhoneNumber.mask），缺失的 id 不在 Map 中 */
    public Map<UUID, String> phonesByIds(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        return namedJdbc.query("SELECT id, phone FROM account.users WHERE id IN (:ids)", Map.of("ids", ids), rs -> {
            Map<UUID, String> phones = new HashMap<>();
            while (rs.next()) {
                phones.put(rs.getObject("id", UUID.class), rs.getString("phone"));
            }
            return phones;
        });
    }

    /**
     * 单个 userId 的手机号点查：拿到的就是明文，只给「逐条索取号码」那类显式动作调用方用（调用方负责留痕），
     * 批量展示一律走 {@link #phonesByIds} 再掩码出参。账号不存在返回 empty。
     */
    public Optional<String> phoneById(UUID userId) {
        List<String> phones =
                jdbc.query("SELECT phone FROM account.users WHERE id = ?", (rs, i) -> rs.getString(1), userId);
        return phones.isEmpty() ? Optional.empty() : Optional.ofNullable(phones.getFirst());
    }

    /**
     * 批量取昵称（评价等公共展示面用）：userId → 昵称原文，缺失的 id 不在 Map 中。
     *
     * <p>原样给原文、不在这里掩码：掩码形状属于展示口径，由消费方（review 的 {@code Nickname.mask}）决定——
     * 账号域不该替别人的页面定「昵称给看几个字」。
     */
    public Map<UUID, String> nicknamesByIds(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        return namedJdbc.query("SELECT id, nickname FROM account.users WHERE id IN (:ids)", Map.of("ids", ids), rs -> {
            Map<UUID, String> nicknames = new HashMap<>();
            while (rs.next()) {
                nicknames.put(rs.getObject("id", UUID.class), rs.getString("nickname"));
            }
            return nicknames;
        });
    }

    /**
     * 账号闸门谓词（下单等交易入口消费）：用户存在且状态 ACTIVE 才放行，用户缺失同样给 false。
     * 只吐谓词不吐 {@code UserStatus} 枚举——状态词表留在本模块，消费方不必（也不允许）import account.model。
     */
    public boolean isActive(UUID userId) {
        List<String> statuses =
                jdbc.query("SELECT status FROM account.users WHERE id = ?", (rs, i) -> rs.getString(1), userId);
        return !statuses.isEmpty() && UserStatus.ACTIVE.name().equals(statuses.getFirst());
    }
}
