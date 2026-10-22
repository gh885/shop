package com.shop.platform.staff.mapper;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** 平台员工账号与岗位权限的 SQL。只做点查，结论在 service 里。 */
@Component
public class StaffStore {

    private static final String FIND_BY_LOGIN =
            """
            SELECT id, login_name, password_hash, display_name, role, status
              FROM staff.account
             WHERE login_name = :loginName
            """;

    private static final String FIND_BY_ID =
            """
            SELECT id, login_name, password_hash, display_name, role, status
              FROM staff.account
             WHERE id = :id
            """;

    private static final String ROLE_PERMISSIONS =
            """
            SELECT permission_code
              FROM staff.role_permission
             WHERE role = :role
            """;

    private final JdbcClient jdbc;

    public StaffStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<StaffRow> findByLogin(String loginName) {
        return jdbc.sql(FIND_BY_LOGIN)
                .param("loginName", loginName)
                .query((rs, row) -> new StaffRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("login_name"),
                        rs.getString("password_hash"),
                        rs.getString("display_name"),
                        rs.getString("role"),
                        rs.getString("status")))
                .optional();
    }

    public Optional<StaffRow> findById(UUID id) {
        return jdbc.sql(FIND_BY_ID)
                .param("id", id)
                .query((rs, row) -> new StaffRow(
                        rs.getObject("id", UUID.class),
                        rs.getString("login_name"),
                        rs.getString("password_hash"),
                        rs.getString("display_name"),
                        rs.getString("role"),
                        rs.getString("status")))
                .optional();
    }

    public List<String> permissionsOf(String role) {
        return jdbc.sql(ROLE_PERMISSIONS)
                .param("role", role)
                .query(String.class)
                .list();
    }

    public record StaffRow(
            UUID id, String loginName, String passwordHash, String displayName, String role, String status) {}
}
