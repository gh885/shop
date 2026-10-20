package com.shop.platform.seller.store;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 登录用的凭证读取。只返回「还在用的账号」——被停用的账号在登录这一步就该消失，不能等到判权时才拦。
 */
@Component
public class OperatorCredentialStore {

    private static final String FIND_ACTIVE =
            """
            SELECT id, merchant_id, password_hash
            FROM seller.operator
            WHERE login_name = ? AND status = 'active'
            """;

    private final JdbcTemplate jdbc;

    public OperatorCredentialStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<Credentials> findActive(String loginName) {
        List<Credentials> found = jdbc.query(
                FIND_ACTIVE,
                (rs, row) -> new Credentials(
                        rs.getObject("id", UUID.class),
                        rs.getObject("merchant_id", UUID.class),
                        rs.getString("password_hash")),
                loginName);
        return found.stream().findFirst();
    }

    public record Credentials(UUID operatorId, UUID merchantId, String passwordHash) {}
}
