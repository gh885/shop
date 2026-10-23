package com.shop.platform.staff.mapper;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** 平台员工账号与岗位权限的 SQL。只做点查与单列条件更新，结论在 service 里。 */
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

    private static final String EXISTS_BY_LOGIN =
            """
            SELECT EXISTS (SELECT 1 FROM staff.account WHERE login_name = :loginName)
            """;

    private static final String INSERT =
            """
            INSERT INTO staff.account (login_name, password_hash, display_name, role)
            VALUES (:loginName, :passwordHash, :displayName, :role)
            """;

    private static final String UPDATE_ROLE =
            """
            UPDATE staff.account SET role = :role WHERE id = :id
            """;

    private static final String UPDATE_STATUS =
            """
            UPDATE staff.account SET status = :status WHERE id = :id AND status <> :status
            """;

    private static final String COUNT_ACTIVE_SUPER_ADMINS =
            """
            SELECT count(*) FROM staff.account WHERE role = 'SUPER_ADMIN' AND status = 'active'
            """;

    /** 末位超管保护的串行闸：两个最后超管在同一刻被分别禁用时，行级条件更新挡不住（两边的写互不碰对方的行），必须先取一把事务级咨询锁再数人 */
    private static final String LOCK_GOVERNANCE =
            """
            SELECT pg_advisory_xact_lock(:lockKey)
            """;

    private final JdbcClient jdbc;

    public StaffStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public Optional<StaffRow> findByLogin(String loginName) {
        return jdbc.sql(FIND_BY_LOGIN)
                .param("loginName", loginName)
                .query(STAFF_MAPPER)
                .optional();
    }

    public Optional<StaffRow> findById(UUID id) {
        return jdbc.sql(FIND_BY_ID).param("id", id).query(STAFF_MAPPER).optional();
    }

    public List<String> permissionsOf(String role) {
        return jdbc.sql(ROLE_PERMISSIONS)
                .param("role", role)
                .query(String.class)
                .list();
    }

    public boolean existsByLoginName(String loginName) {
        return jdbc.sql(EXISTS_BY_LOGIN)
                .param("loginName", loginName)
                .query(Boolean.class)
                .single();
    }

    /** 建行（ACTIVE 默认）。并发撞 uq_staff_login 由调用方 catch DuplicateKeyException 兜。 */
    public void insert(String loginName, String passwordHash, String displayName, String role) {
        jdbc.sql(INSERT)
                .param("loginName", loginName)
                .param("passwordHash", passwordHash)
                .param("displayName", displayName)
                .param("role", role)
                .update();
    }

    public boolean updateRole(UUID id, String role) {
        return jdbc.sql(UPDATE_ROLE).param("id", id).param("role", role).update() == 1;
    }

    /** 落状态：0 行 = 已是目标状态（并发抢先/重复下发），调用方折 409。 */
    public boolean updateStatus(UUID id, String status) {
        return jdbc.sql(UPDATE_STATUS).param("id", id).param("status", status).update() == 1;
    }

    public long countActiveSuperAdmins() {
        return jdbc.sql(COUNT_ACTIVE_SUPER_ADMINS).query(Long.class).single();
    }

    /** 末位超管保护的串行闸。必须在计数前、事务内调用。 */
    public void lockGovernance() {
        jdbc.sql(LOCK_GOVERNANCE)
                .param("lockKey", GOVERNANCE_LOCK_KEY)
                .query(Void.class)
                .single();
    }

    /** 会话级咨询锁的键：staff 治理动作专用，值本身无意义，只要全库一致 */
    private static final long GOVERNANCE_LOCK_KEY = 0x5354_4146_46L; // "STAFF"

    private final org.springframework.jdbc.core.RowMapper<StaffRow> STAFF_MAPPER = (rs, row) -> new StaffRow(
            rs.getObject("id", UUID.class),
            rs.getString("login_name"),
            rs.getString("password_hash"),
            rs.getString("display_name"),
            rs.getString("role"),
            rs.getString("status"));

    public record StaffRow(
            UUID id, String loginName, String passwordHash, String displayName, String role, String status) {

        public boolean active() {
            return "active".equals(status);
        }
    }
}
