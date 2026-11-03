package com.shop.platform.seller.mapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 子账号与角色管理的数据访问：主账号专属（端点层有 SELLER_STAFF_MANAGE 闸），SQL 只按 merchantId 收范围。 */
@Mapper
public interface OperatorManagementMapper {

    String OPERATORS =
            """
            SELECT id, login_name, display_name, status, created_at
              FROM seller.operator
             WHERE merchant_id = #{merchantId} AND is_primary = false
             ORDER BY created_at
            """;

    @Select(OPERATORS)
    List<OperatorRow> findSubOperators(@Param("merchantId") UUID merchantId);

    @Select(
            """
            SELECT id, login_name, display_name, status, created_at
              FROM seller.operator
             WHERE id = #{operatorId} AND merchant_id = #{merchantId} AND is_primary = false
            """)
    Optional<OperatorRow> findSubOperator(@Param("operatorId") UUID operatorId, @Param("merchantId") UUID merchantId);

    @Select(
            """
            <script>
            SELECT DISTINCT g.subject_id AS operatorId, r.id AS roleId, r.code, r.name
              FROM authz.role_grant g
              JOIN authz.role r ON r.id = g.role_id
             WHERE g.subject_type = 'seller' AND g.revoked_at IS NULL
               AND (g.valid_to IS NULL OR g.valid_to > now())
               AND g.subject_id IN
            <foreach collection="operatorIds" item="id" open="(" separator="," close=")">#{id}</foreach>
            ORDER BY r.created_at
            </script>
            """)
    List<OperatorRoleRow> findRolesByOperators(@Param("operatorIds") List<UUID> operatorIds);

    @Select(
            """
            <script>
            SELECT DISTINCT g.subject_id AS operatorId, s.id AS shopId, s.name
              FROM authz.role_grant g
              JOIN seller.shop s ON s.id = g.scope_shop_id
             WHERE g.subject_type = 'seller' AND g.scope_kind = 'shop'
               AND g.revoked_at IS NULL AND (g.valid_to IS NULL OR g.valid_to > now())
               AND g.subject_id IN
            <foreach collection="operatorIds" item="id" open="(" separator="," close=")">#{id}</foreach>
             ORDER BY s.created_at
            </script>
            """)
    List<OperatorShopRow> findShopsByOperators(@Param("operatorIds") List<UUID> operatorIds);

    @Select("SELECT count(*) FROM seller.operator WHERE merchant_id = #{merchantId} AND is_primary = false")
    long countSubOperators(@Param("merchantId") UUID merchantId);

    /** 拼子账号登录名前缀用：主账号登录名创建后不可改，前缀不会悬空 */
    @Select("SELECT login_name FROM seller.operator WHERE merchant_id = #{merchantId} AND is_primary = true")
    Optional<String> findPrimaryLoginName(@Param("merchantId") UUID merchantId);

    @Insert(
            """
            INSERT INTO seller.operator (merchant_id, login_name, password_hash, display_name, is_primary, status)
            VALUES (#{merchantId}, #{loginName}, #{passwordHash}, #{displayName}, false, 'active')
            """)
    void insertSubOperator(
            @Param("merchantId") UUID merchantId,
            @Param("loginName") String loginName,
            @Param("passwordHash") String passwordHash,
            @Param("displayName") String displayName);

    /** 授权或状态变化都要 bump：Authorizer 按 permission_version 判权缓存失效 */
    String BUMP_VERSION =
            "UPDATE seller.operator SET permission_version = permission_version + 1 WHERE id = #{operatorId}";

    @Update(BUMP_VERSION)
    void bumpPermissionVersion(@Param("operatorId") UUID operatorId);

    @Update(
            """
            <script>
            UPDATE seller.operator SET permission_version = permission_version + 1
             WHERE is_primary = false AND id IN
            <foreach collection="operatorIds" item="id" open="(" separator="," close=")">#{id}</foreach>
            </script>
            """)
    void bumpPermissionVersions(@Param("operatorIds") List<UUID> operatorIds);

    @Update(
            "UPDATE seller.operator SET password_hash = #{passwordHash}, permission_version = permission_version + 1 WHERE id = #{operatorId}")
    void updatePassword(@Param("operatorId") UUID operatorId, @Param("passwordHash") String passwordHash);

    @Update("UPDATE seller.operator SET display_name = #{displayName} WHERE id = #{operatorId}")
    void updateDisplayName(@Param("operatorId") UUID operatorId, @Param("displayName") String displayName);

    @Update("UPDATE seller.operator SET status = #{status} WHERE id = #{operatorId}")
    void updateStatus(@Param("operatorId") UUID operatorId, @Param("status") String status);

    /**
     * 撤销这个子账号的全部授权。**标记撤销，不删行**——审计要能回答"某个历史时间点这个人有什么权限"。
     */
    @Update(
            """
            UPDATE authz.role_grant SET revoked_at = now(), revoked_by_type = 'seller', revoked_reason = 'replaced'
             WHERE subject_type = 'seller' AND subject_id = #{operatorId} AND revoked_at IS NULL
            """)
    void revokeGrants(@Param("operatorId") UUID operatorId);

    /**
     * 写入一次授权：一行 = 一个主体 × 一个角色 × 一个店。
     *
     * <p>调用方负责展开角色 × 店的笛卡尔积——"一行一个范围"让撤销单个店是标记一行，
     * 而不是读-改-写一个集合。
     */
    @Insert(
            """
            INSERT INTO authz.role_grant
                (subject_type, subject_id, role_id, scope_kind, scope_shop_id,
                 granted_by_type, granted_by_id)
            VALUES ('seller', #{operatorId}, #{roleId}, 'shop', #{shopId}, 'seller', #{grantedBy})
            """)
    void insertGrant(
            @Param("operatorId") UUID operatorId,
            @Param("roleId") UUID roleId,
            @Param("shopId") UUID shopId,
            @Param("grantedBy") UUID grantedBy);

    // ---- 角色 ----

    @Select(
            """
            SELECT id, code, name FROM authz.role
             WHERE owner_kind = 'merchant' AND owner_id = #{merchantId} AND status = 'active'
             ORDER BY created_at
            """)
    List<RoleRow> findRoles(@Param("merchantId") UUID merchantId);

    @Select(
            """
            SELECT id, code, name FROM authz.role
             WHERE id = #{roleId} AND owner_kind = 'merchant' AND owner_id = #{merchantId}
            """)
    Optional<RoleRow> findRole(@Param("roleId") UUID roleId, @Param("merchantId") UUID merchantId);

    @Select("SELECT permission_code FROM authz.role_permission WHERE role_id = #{roleId}")
    List<String> findRolePermissions(@Param("roleId") UUID roleId);

    @Select(
            """
            <script>
            SELECT rp.role_id AS roleId, rp.permission_code AS permissionCode
              FROM authz.role_permission rp
              JOIN authz.role r ON r.id = rp.role_id
             WHERE r.owner_kind = 'merchant' AND r.owner_id = #{merchantId}
            </script>
            """)
    List<RolePermissionRow> findPermissionsByMerchant(@Param("merchantId") UUID merchantId);

    @Insert(
            "INSERT INTO authz.role (owner_kind, owner_id, code, name) VALUES ('merchant', #{merchantId}, #{code}, #{name})")
    void insertRole(@Param("merchantId") UUID merchantId, @Param("code") String code, @Param("name") String name);

    @Update("UPDATE authz.role SET max_refund_amount = #{cap} WHERE id = #{roleId}")
    void updateRoleCap(@Param("roleId") UUID roleId, @Param("cap") Long cap);

    @Update("UPDATE authz.role SET name = #{name} WHERE id = #{roleId}")
    void updateRoleName(@Param("roleId") UUID roleId, @Param("name") String name);

    @Delete("DELETE FROM authz.role WHERE id = #{roleId} AND owner_kind = 'merchant' AND owner_id = #{merchantId}")
    int deleteRole(@Param("roleId") UUID roleId, @Param("merchantId") UUID merchantId);

    @Delete("DELETE FROM authz.role_permission WHERE role_id = #{roleId}")
    void clearRolePermissions(@Param("roleId") UUID roleId);

    @Insert(
            """
            <script>
            INSERT INTO authz.role_permission (role_id, permission_code) VALUES
            <foreach collection="codes" item="code" separator=",">(#{roleId}, #{code})</foreach>
            </script>
            """)
    void grantRolePermissions(@Param("roleId") UUID roleId, @Param("codes") List<String> codes);

    /** 角色被哪些子账号挂着：删除前查引用，删挂着的角色会静默收回一片人的权限 */
    @Select(
            """
            <script>
            SELECT DISTINCT subject_id AS operatorId FROM authz.role_grant
             WHERE role_id = #{roleId} AND subject_type = 'seller' AND revoked_at IS NULL
            </script>
            """)
    List<OperatorRoleRef> findOperatorsWithRole(@Param("roleId") UUID roleId);

    @Select(
            """
            <script>
            SELECT id FROM seller.shop
             WHERE merchant_id = #{merchantId} AND id IN
            <foreach collection="shopIds" item="id" open="(" separator="," close=")">#{id}</foreach>
            </script>
            """)
    List<UUID> findOwnedShopIds(@Param("merchantId") UUID merchantId, @Param("shopIds") List<UUID> shopIds);

    @Select(
            """
            <script>
            SELECT id, code FROM authz.role
             WHERE owner_kind = 'merchant' AND owner_id = #{merchantId} AND id IN
            <foreach collection="roleIds" item="id" open="(" separator="," close=")">#{id}</foreach>
            </script>
            """)
    List<RoleRow> findOwnedRoles(@Param("merchantId") UUID merchantId, @Param("roleIds") List<UUID> roleIds);

    @Select(
            """
            SELECT id, name, status FROM seller.shop
             WHERE merchant_id = #{merchantId}
             ORDER BY created_at
            """)
    List<ShopRow> findMerchantShops(@Param("merchantId") UUID merchantId);

    @Select("SELECT is_primary FROM seller.operator WHERE id = #{operatorId}")
    Optional<Boolean> isPrimary(@Param("operatorId") UUID operatorId);

    record OperatorRow(UUID id, String loginName, String displayName, String status, java.time.Instant createdAt) {}

    record OperatorRoleRow(UUID operatorId, UUID roleId, String code, String name) {}

    record OperatorShopRow(UUID operatorId, UUID shopId, String name) {}

    record RoleRow(UUID id, String code, String name) {}

    record RolePermissionRow(UUID roleId, String permissionCode) {}

    record OperatorRoleRef(UUID operatorId) {}

    record ShopRow(UUID id, String name, String status) {}
}
