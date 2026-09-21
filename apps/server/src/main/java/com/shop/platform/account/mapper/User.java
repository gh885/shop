package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.account.model.UserStatus;
import com.shop.platform.infra.db.AuditedEntity;
import java.time.OffsetDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 平台用户 —— 买家/卖家的统一账号，auth schema。
 *
 * <p>手机号为登录账号，全局唯一；注册走短信验证码自动注册，密码为预留字段可后补。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("account.users")
public class User extends AuditedEntity {

    /** 登录账号（手机号）。全局唯一，唯一索引 idx_users_phone 兜底并发 */
    private String phone;

    /** 密码哈希（BCrypt）。短信注册的账号为 NULL（未设密码），走密码登录时校验 */
    private String passwordHash;

    /** 昵称，展示用，可空 */
    private String nickname;

    /** 头像 key（对象存储 key，非完整 URL，换 CDN/域名不影响存量数据），可空 */
    private String avatarKey;

    /** 账号状态：正常/禁用，概念归 {@link UserStatus}；不做物理删除 */
    private UserStatus status;

    /** 最近一次登录时间，用于安全提醒/活跃度统计，可空 */
    private OffsetDateTime lastLoginAt;

    // 工厂
    /** 短信验证码自动注册的新用户：状态固定 ACTIVE，密码后补。phone 为唯一必填，由构造签名编译期强制 */
    public static User autoRegister(String phone) {
        return User.builder().phone(phone).status(UserStatus.ACTIVE).build();
    }

    /** 是否正常账号（登录/刷新的闸门）；禁用/注销返回 false。下单同样查此状态（order 经 {@code UserReadQuery.isActive} 闸门） */
    public boolean isActive() {
        return status != null && status.isActive();
    }
}
