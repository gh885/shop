package com.shop.platform.account.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
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
            SELECT id AS buyer_id, phone, password_hash, nickname
              FROM account.buyer
             WHERE phone = :phone AND status = 'active'
            """;

    private static final String FIND =
            """
            SELECT id AS buyer_id, nickname, status
              FROM account.buyer
             WHERE id = :id
            """;

    private static final String INSERT =
            """
            INSERT INTO account.buyer (id, phone, password_hash, nickname)
            VALUES (:id, :phone, :passwordHash, :nickname)
            """;

    private static final RowMapper<Credentials> CREDENTIALS = RowMappers.of(Credentials.class);

    private static final RowMapper<BuyerRow> BUYER = RowMappers.of(BuyerRow.class);

    private final JdbcClient jdbc;

    public BuyerStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    /** 登录用：只认 active。 */
    public Optional<Credentials> findActiveByPhone(String phone) {
        return jdbc.sql(FIND_ACTIVE_BY_PHONE)
                .param("phone", phone)
                .query(CREDENTIALS)
                .optional();
    }

    /** 查人，不筛状态——停用买家也要能看自己的订单。 */
    public Optional<BuyerRow> find(UUID buyerId) {
        return jdbc.sql(FIND).param("id", buyerId).query(BUYER).optional();
    }

    public void insert(UUID id, String phone, String passwordHash, String nickname) {
        jdbc.sql(INSERT)
                .param("id", id)
                .param("phone", phone)
                .param("passwordHash", passwordHash)
                .param("nickname", nickname)
                .update();
    }

    public record Credentials(UUID buyerId, String phone, String passwordHash, String nickname) {}

    public record BuyerRow(UUID buyerId, String nickname, String status) {

        public boolean active() {
            return "active".equals(status);
        }
    }
}
