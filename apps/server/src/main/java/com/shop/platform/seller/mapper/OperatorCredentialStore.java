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

    private static final String FIND_BY_ID =
            """
            SELECT id AS operator_id, merchant_id, status
              FROM seller.operator
             WHERE id = :id
            """;

    private static final RowMapper<Credentials> MAPPER = RowMappers.of(Credentials.class);

    private static final RowMapper<SessionRow> SESSION = RowMappers.of(SessionRow.class);

    private final JdbcClient jdbc;

    public OperatorCredentialStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<Credentials> findActive(String loginName) {
        return jdbc.sql(FIND_ACTIVE).param("loginName", loginName).query(MAPPER).optional();
    }

    /** 刷新链路用：按 id 找人，状态由 service 判（禁用账号的旧 refresh 在轮换时就被拦下）。 */
    public Optional<SessionRow> findById(UUID operatorId) {
        return jdbc.sql(FIND_BY_ID).param("id", operatorId).query(SESSION).optional();
    }

    public record Credentials(UUID operatorId, UUID merchantId, String passwordHash) {}

    public record SessionRow(UUID operatorId, UUID merchantId, String status) {

        public boolean active() {
            return "active".equals(status);
        }
    }
}
