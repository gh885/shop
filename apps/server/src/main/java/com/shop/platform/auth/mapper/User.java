package com.shop.platform.auth.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 平台用户 —— 买家/卖家的统一账号，auth schema。
 *
 * <p>手机号为登录账号，全局唯一；注册走短信验证码自动注册，密码为预留字段可后补。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("auth.users")
public class User {

    /** 账号状态：ACTIVE 正常（与 status 字段 javadoc 同步）。提升为常量，工厂与业务层共享，防硬编码 */
    public static final String STATUS_ACTIVE = "ACTIVE";

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 登录账号（手机号）。全局唯一，唯一索引 idx_users_phone 兜底并发 */
    private String phone;

    /** 密码哈希（BCrypt）。短信注册的账号为 NULL（未设密码），走密码登录时校验 */
    private String passwordHash;

    /** 昵称，展示用，可空 */
    private String nickname;

    /** 头像 key（对象存储 key，非完整 URL，换 CDN/域名不影响存量数据），可空 */
    private String avatarKey;

    /** 账号状态：ACTIVE 正常，其他值表示禁用/注销；不做物理删除 */
    private String status;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;

    /** 最近一次登录时间，用于安全提醒/活跃度统计，可空 */
    private OffsetDateTime lastLoginAt;

    // ---- 工厂 ----

    /** 短信验证码自动注册的新用户：状态固定 ACTIVE，密码后补。phone 为唯一必填，由构造签名编译期强制 */
    public static User autoRegister(String phone) {
        return User.builder().phone(phone).status(STATUS_ACTIVE).build();
    }
}
