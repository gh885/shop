package com.shop.platform.account.mapper;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 买家账号的读写。
 *
 * <p>只返回「还在用的账号」给登录用——被停用的账号在登录这一步就该消失，不能等到判权时才拦。
 * 查历史订单走 {@link #find}，那个不筛状态：停用的人也要能看自己的订单。
 */
@Component
public class BuyerStore {

    private static final String FIND_ACTIVE_BY_PHONE =
            """
            SELECT id, phone, password_hash, nickname
            FROM account.buyer
            WHERE phone = ? AND status = 'active'
            """;

    private static final String FIND =
            """
            SELECT id, nickname, status
            FROM account.buyer
            WHERE id = ?
            """;

    private static final String INSERT =
            """
            INSERT INTO account.buyer (id, phone, password_hash, nickname)
            VALUES (?, ?, ?, ?)
            """;

    private final JdbcTemplate jdbc;

    public BuyerStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 登录用：只认 active。 */
    public Optional<Credentials> findActiveByPhone(String phone) {
        List<Credentials> found = jdbc.query(
                FIND_ACTIVE_BY_PHONE,
                (rs, row) -> new Credentials(
                        rs.getObject("id", UUID.class),
                        rs.getString("phone"),
                        rs.getString("password_hash"),
                        rs.getString("nickname")),
                phone);
        return found.stream().findFirst();
    }

    /** 查人，不筛状态——停用买家也要能看自己的订单。 */
    public Optional<BuyerRow> find(UUID buyerId) {
        return jdbc
                .query(
                        FIND,
                        (rs, row) -> new BuyerRow(
                                rs.getObject("id", UUID.class), rs.getString("nickname"), rs.getString("status")),
                        buyerId)
                .stream()
                .findFirst();
    }

    public void insert(UUID id, String phone, String passwordHash, String nickname) {
        jdbc.update(INSERT, id, phone, passwordHash, nickname);
    }

    public record Credentials(UUID buyerId, String phone, String passwordHash, String nickname) {}

    public record BuyerRow(UUID buyerId, String nickname, String status) {

        public boolean active() {
            return "active".equals(status);
        }
    }
}
