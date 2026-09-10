package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.account.model.StaffStatus;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 平台员工 —— 平台官方人员（apps/admin 的受众），与买家/卖家（account.users）是两套独立账号体系。
 *
 * <p>登录凭证是工号 + 密码，不走手机验证码；登录入口、token 范围与 C 端隔离（token 设计见 docs/decisions/auth.md）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("account.staff")
public class Staff {

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 工号。登录账号，全局唯一，唯一索引 uk_staff_employee_no 兜底并发；由管理员创建，员工不自助注册 */
    private String employeeNo;

    /** 密码哈希（BCrypt）。平台员工登录必填密码，与 user.password_hash 同风格 */
    private String passwordHash;

    /** 真名/展示名，可空 */
    private String displayName;

    /** 员工状态：正常/禁用，概念归 {@link StaffStatus}；不做物理删除 */
    private StaffStatus status;

    /** 是否可登录/操作后台的闸门 */
    public boolean isActive() {
        return status != null && status.isActive();
    }

    /** 岗位：StaffRole 枚举名（SUPER_ADMIN/REVIEWER/OPS）。岗位→权限码映射见 admin/service/StaffRole，库里只存岗位名 */
    private String role;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
