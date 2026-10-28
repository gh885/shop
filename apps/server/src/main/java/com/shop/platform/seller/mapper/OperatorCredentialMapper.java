package com.shop.platform.seller.mapper;

import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 登录用的凭证读取。只返回「还在用的账号」——被停用的账号在登录这一步就该消失，不能等到判权时才拦。
 */
@Mapper
public interface OperatorCredentialMapper {

    @Select(
            """
            SELECT id AS operator_id, merchant_id, password_hash
              FROM seller.operator
             WHERE login_name = #{loginName} AND status = 'active'
            """)
    Optional<Credentials> findActive(@Param("loginName") String loginName);

    /** 刷新链路用：按 id 找人，状态由 service 判（禁用账号的旧 refresh 在轮换时就被拦下）。 */
    @Select(
            """
            SELECT id AS operator_id, merchant_id, status
              FROM seller.operator
             WHERE id = #{id}
            """)
    Optional<SessionRow> findById(@Param("id") UUID operatorId);

    /** 写语言偏好：null 是合法值（清回没表过态），故无条件覆盖。 */
    @Update("UPDATE seller.operator SET preferred_locale = #{preferredLocale} WHERE id = #{id}")
    boolean updatePreferredLocale(@Param("id") UUID id, @Param("preferredLocale") String preferredLocale);

    /** 读语言偏好。列可空，查无此人时返回 empty。 */
    @Select("SELECT preferred_locale FROM seller.operator WHERE id = #{id}")
    Optional<String> findPreferredLocale(@Param("id") UUID id);

    record Credentials(UUID operatorId, UUID merchantId, String passwordHash) {}

    record SessionRow(UUID operatorId, UUID merchantId, String status) {

        public boolean active() {
            return "active".equals(status);
        }
    }
}
