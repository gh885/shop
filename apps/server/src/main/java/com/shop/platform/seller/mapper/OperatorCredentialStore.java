package com.shop.platform.seller.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 登录用的凭证读取。只返回「还在用的账号」——被停用的账号在登录这一步就该消失，不能等到判权时才拦。
 */
@Component
public class OperatorCredentialStore {

    private static final String FIND_ACTIVE =
            """
            SELECT id AS operator_id, merchant_id, password_hash
              FROM seller.operator
             WHERE login_name = :loginName AND status = 'active'
            """;

    private static final RowMapper<Credentials> MAPPER = RowMappers.of(Credentials.class);

    private final JdbcClient jdbc;

    public OperatorCredentialStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<Credentials> findActive(String loginName) {
        return jdbc.sql(FIND_ACTIVE).param("loginName", loginName).query(MAPPER).optional();
    }

    public record Credentials(UUID operatorId, UUID merchantId, String passwordHash) {}
}
