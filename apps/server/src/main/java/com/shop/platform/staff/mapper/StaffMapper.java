package com.shop.platform.staff.mapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 平台员工账号与岗位权限的 SQL。只做点查与单列条件更新，结论在 service 里。 */
@Mapper
public interface StaffMapper {

    @Select(
            """
            SELECT id, login_name, password_hash, display_name, role, status, permission_version
              FROM staff.member
             WHERE login_name = #{loginName}
            """)
    Optional<StaffRow> findByLogin(@Param("loginName") String loginName);

    @Select(
            """
            SELECT id, login_name, password_hash, display_name, role, status, permission_version
              FROM staff.member
             WHERE id = #{id}
            """)
    Optional<StaffRow> findById(@Param("id") UUID id);

    @Select(
            """
            SELECT permission_code
              FROM staff.role_permission
             WHERE role = #{role}
            """)
    List<String> permissionsOf(@Param("role") String role);

    @Select("SELECT EXISTS (SELECT 1 FROM staff.member WHERE login_name = #{loginName})")
    boolean existsByLoginName(@Param("loginName") String loginName);

    /** 建行（ACTIVE 默认）。并发撞 uq_staff_login 由调用方 catch DuplicateKeyException 兜。 */
    @Insert(
            """
            INSERT INTO staff.member (login_name, password_hash, display_name, role)
            VALUES (#{loginName}, #{passwordHash}, #{displayName}, #{role})
            """)
    void insert(
            @Param("loginName") String loginName,
            @Param("passwordHash") String passwordHash,
            @Param("displayName") String displayName,
            @Param("role") String role);

    /** 角色变更必须同步 bump 快照版本——权限是每请求回库解析的，bump 让将来加缓存时旧快照自动失效。 */
    @Update("UPDATE staff.member SET role = #{role}, permission_version = permission_version + 1 WHERE id = #{id}")
    boolean updateRole(@Param("id") UUID id, @Param("role") String role);

    /** 落状态：0 行 = 已是目标状态（并发抢先/重复下发），调用方折 409。状态变更同步 bump 快照版本。 */
    @Update("UPDATE staff.member SET status = #{status}, permission_version = permission_version + 1"
            + " WHERE id = #{id} AND status <> #{status}")
    boolean updateStatus(@Param("id") UUID id, @Param("status") String status);

    @Select("SELECT count(*) FROM staff.member WHERE role = 'SUPER_ADMIN' AND status = 'active'")
    long countActiveSuperAdmins();

    /** 种子用：库里有没有任何员工账号（不限状态）。 */
    @Select("SELECT count(*) FROM staff.member")
    long countAll();

    /** 末位超管保护的串行闸。必须在计数前、事务内调用。 */
    default void lockGovernance() {
        lockGovernanceRow(GOVERNANCE_LOCK_KEY);
    }

    /** 会话级咨询锁的键：staff 治理动作专用，值本身无意义，只要全库一致 */
    long GOVERNANCE_LOCK_KEY = 0x5354_4146_46L; // "STAFF"

    /**
     * 末位超管保护的串行闸：两个最后超管在同一刻被分别禁用时，行级条件更新挡不住（两边的写互不碰对方的行），
     * 必须先取一把事务级咨询锁再数人
     */
    @Select("SELECT pg_advisory_xact_lock(#{lockKey})")
    void lockGovernanceRow(@Param("lockKey") long lockKey);

    public record StaffRow(
            UUID id,
            String loginName,
            String passwordHash,
            String displayName,
            String role,
            String status,
            long permissionVersion) {

        public boolean active() {
            return "active".equals(status);
        }
    }
}
